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
  CreateRelationshipPayload,
  CreateRelationshipResponse,
  PreviewPerson,
  RelationshipsApiService,
} from '../../../core/services/relationships-api.service';
import { Person } from '../../../shared/models/person.model';
import { RelationshipType } from '../../../shared/models/relationship.model';
import { ApiError } from '../../../shared/models/pagination.model';
import { NO_PARENTS_RECORDED, relateAsSibling } from '../sibling-relation';
import { LinkResult, collectLinkIds } from '../link-result';
import { RelativesPreviewComponent } from '../relatives-preview/relatives-preview.component';

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
    this.previewPeople.set(null);
    this.searchTerm$.next(value);
  }

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const person = event.option.value as Person;
    this.selectedPerson.set(person);
    this.previewPeople.set(null);
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
      this.save(false);
      return;
    }

    this.saving.set(true);
    this.relationshipsApi.previewAdditions(this.data.familyId, [this.data.anchorPerson.id, selected.id]).subscribe({
      next: ({ people }) => {
        this.saving.set(false);
        if (people.some((p) => p.reason !== 'linked')) {
          this.previewPeople.set(people);
        } else {
          this.save(false);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  /** Step 2: save the link, optionally adding the previewed relatives too. */
  save(includeRelatives: boolean): void {
    const selected = this.selectedPerson();
    if (!selected || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const { relationOption } = this.form.getRawValue();

    const request$: Observable<CreateRelationshipResponse | CreateRelationshipResponse[]> =
      relationOption === 'SIBLING_OF'
        ? relateAsSibling(this.familyTreeApi, this.relationshipsApi, this.data.familyId, this.data.anchorPerson.id, selected.id)
        : this.relationshipsApi.create(this.data.familyId, {
            ...this.buildPayload(selected.id, relationOption),
            includeRelatives,
          });

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        const ids = collectLinkIds(res);
        const others = ids.addedPersonIds.filter((id) => id !== selected.id).length;
        const result: LinkResult = {
          message:
            `Linked ${this.data.anchorPerson.name} and ${selected.firstName}.` +
            (others > 0 ? ` Added ${others} ${others === 1 ? 'relative' : 'relatives'} to this family.` : ''),
          undo: ids,
        };
        this.dialogRef.close(result);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.previewPeople.set(null);
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
