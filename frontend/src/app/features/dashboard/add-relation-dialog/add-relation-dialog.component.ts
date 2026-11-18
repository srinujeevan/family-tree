import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FamilyTreeApiService } from '../../../core/services/family-tree-api.service';
import { PersonsApiService } from '../../../core/services/persons-api.service';
import {
  ChildFamilyPreview,
  CreateRelationshipPayload,
  CreateRelationshipResponse,
  PreviewPerson,
  RelationshipsApiService,
} from '../../../core/services/relationships-api.service';
import { Person } from '../../../shared/models/person.model';
import { RelationshipType } from '../../../shared/models/relationship.model';
import { ApiError } from '../../../shared/models/pagination.model';
import { NO_PARENTS_RECORDED, relateAsSibling } from '../sibling-relation';
import { LinkResult, alsoAddedText, collectLinkIds } from '../link-result';
import { RelativesPreviewComponent } from '../relatives-preview/relatives-preview.component';
import { ChildFamiliesPreviewComponent } from '../child-families-preview/child-families-preview.component';

export interface AddRelationDialogData {
  familyId: string;
  anchorPerson: { id: string; name: string };
}

type RelationOption = 'PARENT_OF' | 'CHILD_OF' | 'SIBLING_OF' | 'SPOUSE_OF' | 'GUARDIAN_OF' | 'WARD_OF';

const RELATION_OPTIONS: { value: RelationOption; label: string }[] = [
  { value: 'PARENT_OF', label: 'Parent of' },
  { value: 'CHILD_OF', label: 'Child of' },
  { value: 'SIBLING_OF', label: 'Sibling of' },
  { value: 'SPOUSE_OF', label: 'Spouse of' },
  { value: 'GUARDIAN_OF', label: 'Guardian of' },
  { value: 'WARD_OF', label: 'Ward of (they are the guardian)' },
];

function personLabel(person: Person): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
  const families = person.families?.map((f) => f.familyName).join(', ');
  return families ? `${name} (${families})` : name;
}

@Component({
  selector: 'app-add-relation-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatAutocompleteModule,
    RelativesPreviewComponent,
    ChildFamiliesPreviewComponent,
  ],
  templateUrl: './add-relation-dialog.component.html',
  styleUrl: './add-relation-dialog.component.scss',
})
export class AddRelationDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly personsApi = inject(PersonsApiService);
  private readonly relationshipsApi = inject(RelationshipsApiService);
  private readonly familyTreeApi = inject(FamilyTreeApiService);
  private readonly dialogRef = inject(MatDialogRef<AddRelationDialogComponent>);
  readonly data = inject<AddRelationDialogData>(MAT_DIALOG_DATA);

  readonly relationOptions = RELATION_OPTIONS;
  readonly searchResults = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly searchText = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Set when linking would bring relatives along - the dialog then shows the preview. */
  readonly previewPeople = signal<PreviewPerson[] | null>(null);
  /** Set when the parent is also in other families - the dialog then asks about adding the child there. */
  readonly childFamilies = signal<ChildFamilyPreview[] | null>(null);
  /** The choice made in the relatives preview, carried into the save. */
  private includeRelatives = false;
  readonly personLabel = personLabel;

  readonly form = this.fb.nonNullable.group({
    relationOption: ['PARENT_OF' as RelationOption],
  });

  // Decoupled from Reactive Forms on purpose: the input's value toggles
  // between free-typed text and a selected person's display label, which
  // doesn't play well with a single typed FormControl<string>.
  private readonly searchTerm$ = new Subject<string>();

  constructor() {
    this.searchTerm$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => this.personsApi.listAll(term || undefined)),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.searchResults.set(page.data.filter((p) => p.id !== this.data.anchorPerson.id));
      });
    this.searchTerm$.next('');
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText.set(value);
    this.selectedPerson.set(null);
    this.resetPreviews();
    this.searchTerm$.next(value);
  }

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const person = event.option.value as Person;
    this.selectedPerson.set(person);
    this.resetPreviews();
    this.searchText.set(this.personLabel(person));
  }

  /** Step 1: check who would come along; show the preview if anyone besides the linked person would. */
  submit(): void {
    const selected = this.selectedPerson();
    if (!selected) {
      this.errorMessage.set('Choose a person to relate to.');
      return;
    }
    if (this.saving()) {
      return;
    }
    this.errorMessage.set(null);
    const { relationOption } = this.form.getRawValue();

    // Sibling links attach to existing parents in this family - nobody new comes along.
    if (relationOption === 'SIBLING_OF') {
      this.includeRelatives = false;
      this.save([]);
      return;
    }

    this.saving.set(true);
    this.relationshipsApi.previewAdditions(this.data.familyId, [this.data.anchorPerson.id, selected.id]).subscribe({
      next: ({ people }) => {
        this.saving.set(false);
        if (people.some((p) => p.reason !== 'linked')) {
          this.previewPeople.set(people);
        } else {
          this.chooseRelatives(false);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  /**
   * Step 2: after the relatives decision, for parent/child links check whether
   * the parent is also in other families - if so, ask whether the child should
   * join those too.
   */
  chooseRelatives(includeRelatives: boolean): void {
    this.includeRelatives = includeRelatives;
    const pair = this.parentAndChild();
    if (!pair) {
      this.save([]);
      return;
    }
    this.saving.set(true);
    this.relationshipsApi.previewChildFamilies(this.data.familyId, pair.parentId, pair.childId).subscribe({
      next: ({ families }) => {
        this.saving.set(false);
        if (families.length > 0) {
          this.childFamilies.set(families);
        } else {
          this.save([]);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  /** Back from either preview: start over from the form. */
  resetPreviews(): void {
    this.previewPeople.set(null);
    this.childFamilies.set(null);
  }

  /** Who is parent and who is child, for "is parent of" / "is child of"; null for other relations. */
  parentAndChild(): { parentId: string; childId: string; parentName: string; childName: string } | null {
    const selected = this.selectedPerson();
    const { relationOption } = this.form.getRawValue();
    if (!selected) return null;
    const anchor = { id: this.data.anchorPerson.id, name: this.data.anchorPerson.name };
    const other = { id: selected.id, name: selected.firstName };
    if (relationOption === 'PARENT_OF') {
      return { parentId: anchor.id, parentName: anchor.name, childId: other.id, childName: other.name };
    }
    if (relationOption === 'CHILD_OF') {
      return { parentId: other.id, parentName: other.name, childId: anchor.id, childName: anchor.name };
    }
    return null;
  }

  /** Step 3: save the link with the choices made in the previews. */
  save(alsoAddToFamilyIds: string[]): void {
    const selected = this.selectedPerson();
    if (!selected || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const { relationOption } = this.form.getRawValue();
    const familyNames = (this.childFamilies() ?? [])
      .filter((f) => alsoAddToFamilyIds.includes(f.familyId))
      .map((f) => f.familyName);

    const request$: Observable<CreateRelationshipResponse | CreateRelationshipResponse[]> =
      relationOption === 'SIBLING_OF'
        ? relateAsSibling(this.familyTreeApi, this.relationshipsApi, this.data.familyId, this.data.anchorPerson.id, selected.id)
        : this.relationshipsApi.create(this.data.familyId, {
            ...this.buildPayload(selected.id, relationOption),
            includeRelatives: this.includeRelatives,
            alsoAddToFamilyIds,
          });

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        const ids = collectLinkIds(res);
        const others = ids.addedPersonIds.filter((id) => id !== selected.id).length;
        const result: LinkResult = {
          message:
            `Linked ${this.data.anchorPerson.name} and ${selected.firstName}.` +
            (others > 0 ? ` Added ${others} ${others === 1 ? 'relative' : 'relatives'} to this family.` : '') +
            alsoAddedText(familyNames),
          undo: ids,
        };
        this.dialogRef.close(result);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.resetPreviews();
        this.errorMessage.set(this.extractMessage(err, selected));
      },
    });
  }

  private buildPayload(selectedPersonId: string, relationOption: Exclude<RelationOption, 'SIBLING_OF'>): CreateRelationshipPayload {
    const typeByOption: Record<Exclude<RelationOption, 'SIBLING_OF'>, RelationshipType> = {
      PARENT_OF: 'PARENT',
      CHILD_OF: 'PARENT',
      SPOUSE_OF: 'SPOUSE',
      GUARDIAN_OF: 'GUARDIAN',
      WARD_OF: 'GUARDIAN',
    };
    const selectedIsSubject = relationOption === 'CHILD_OF' || relationOption === 'WARD_OF';
    const anchorId = this.data.anchorPerson.id;
    return {
      personId: selectedIsSubject ? selectedPersonId : anchorId,
      relatedPersonId: selectedIsSubject ? anchorId : selectedPersonId,
      relationshipType: typeByOption[relationOption],
    };
  }

  private extractMessage(err: unknown, siblingTarget?: Person): string {
    if (err instanceof Error && err.message === NO_PARENTS_RECORDED && siblingTarget) {
      return `${this.personLabel(siblingTarget)} has no parents recorded in this family yet - add a parent relationship for them first, then try marking a sibling.`;
    }
    if (err instanceof HttpErrorResponse) {
      const apiError = err.error as ApiError | undefined;
      if (apiError?.error?.message) {
        return apiError.error.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
