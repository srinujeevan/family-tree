import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { Gender, Person } from '../../../shared/models/person.model';
import { RelationshipType } from '../../../shared/models/relationship.model';
import { ApiError } from '../../../shared/models/pagination.model';
import { NO_PARENTS_RECORDED, relateAsSibling } from '../sibling-relation';
import { LinkResult, collectLinkIds } from '../link-result';
import { RelativesPreviewComponent } from '../relatives-preview/relatives-preview.component';

export interface AddPersonDialogData {
  familyId: string;
}

type RelationOption = 'PARENT_OF' | 'CHILD_OF' | 'SIBLING_OF' | 'SPOUSE_OF' | 'GUARDIAN_OF' | 'WARD_OF';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];

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
  selector: 'app-add-person-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatAutocompleteModule,
    RelativesPreviewComponent,
  ],
  templateUrl: './add-person-dialog.component.html',
  styleUrl: './add-person-dialog.component.scss',
})
export class AddPersonDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly personsApi = inject(PersonsApiService);
  private readonly relationshipsApi = inject(RelationshipsApiService);
  private readonly familyTreeApi = inject(FamilyTreeApiService);
  private readonly dialogRef = inject(MatDialogRef<AddPersonDialogComponent>);
  readonly data = inject<AddPersonDialogData>(MAT_DIALOG_DATA);

  readonly genderOptions = GENDER_OPTIONS;
  readonly relationOptions = RELATION_OPTIONS;
  readonly personLabel = personLabel;

  readonly searchResults = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly searchText = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Set when relating to the chosen person would bring their relatives along. */
  readonly previewPeople = signal<PreviewPerson[] | null>(null);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    middleName: [''],
    lastName: [''],
    gender: ['UNKNOWN' as Gender],
    dateOfBirth: [''],
    relateEnabled: [false],
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
      .subscribe((page) => this.searchResults.set(page.data));
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
    this.searchText.set(personLabel(person));
  }

  /**
   * Step 1: if relating to someone, check who would come along BEFORE
   * creating the new person - so "Back" leaves nothing half-saved.
   */
  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const relateTo = this.form.controls.relateEnabled.value ? this.selectedPerson() : null;
    if (this.form.controls.relateEnabled.value && !relateTo) {
      this.errorMessage.set('Choose a family member to relate to, or turn off "Add a relation".');
      return;
    }
    this.errorMessage.set(null);

    if (!relateTo || this.form.controls.relationOption.value === 'SIBLING_OF') {
      this.save(false);
      return;
    }

    this.saving.set(true);
    this.relationshipsApi.previewAdditions(this.data.familyId, [relateTo.id]).subscribe({
      next: ({ people }) => {
        this.saving.set(false);
        if (people.some((p) => p.reason !== 'linked')) {
          this.previewPeople.set(people);
        } else {
          this.save(false);
        }
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  /** Step 2: create the person, then the relation (optionally with the previewed relatives). */
  save(includeRelatives: boolean): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    this.personsApi
      .create(this.data.familyId, {
        firstName: value.firstName,
        middleName: value.middleName || undefined,
        lastName: value.lastName || undefined,
        gender: value.gender,
        dateOfBirth: value.dateOfBirth || undefined,
      })
      .subscribe({
        next: (res) => this.maybeCreateRelation(res.person, value.relateEnabled, value.relationOption, includeRelatives),
        error: (err: unknown) => this.fail(err),
      });
  }

  private maybeCreateRelation(
    person: Person,
    relateEnabled: boolean,
    relationOption: RelationOption,
    includeRelatives: boolean,
  ): void {
    const relatedPerson = this.selectedPerson();
    if (!relateEnabled || !relatedPerson) {
      this.saving.set(false);
      const result: LinkResult = {
        message: `Added ${person.firstName}.`,
        undo: { relationshipIds: [], addedPersonIds: [], createdPersonId: person.id },
      };
      this.dialogRef.close(result);
      return;
    }

    const request$: Observable<CreateRelationshipResponse | CreateRelationshipResponse[]> =
      relationOption === 'SIBLING_OF'
        ? relateAsSibling(this.familyTreeApi, this.relationshipsApi, this.data.familyId, person.id, relatedPerson.id)
        : this.relationshipsApi.create(this.data.familyId, {
            ...this.buildRelationshipPayload(person.id, relatedPerson.id, relationOption),
            includeRelatives,
          });

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        const ids = collectLinkIds(res);
        const others = ids.addedPersonIds.filter((id) => id !== relatedPerson.id && id !== person.id).length;
        const result: LinkResult = {
          message:
            `Added ${person.firstName}, linked to ${relatedPerson.firstName}.` +
            (others > 0 ? ` Also added ${others} ${others === 1 ? 'relative' : 'relatives'} to this family.` : ''),
          undo: { ...ids, createdPersonId: person.id },
        };
        this.dialogRef.close(result);
      },
      error: (err: unknown) => {
        // The person was created successfully even if the relation failed -
        // close the dialog with that fact rather than losing the work, but
        // surface the relation error so the user knows to add it manually.
        this.saving.set(false);
        this.errorMessage.set(
          `Person created, but the relation could not be added: ${this.extractMessage(err, relatedPerson)}`,
        );
      },
    });
  }

  private buildRelationshipPayload(
    newPersonId: string,
    selectedPersonId: string,
    relationOption: Exclude<RelationOption, 'SIBLING_OF'>,
  ): CreateRelationshipPayload {
    const typeByOption: Record<Exclude<RelationOption, 'SIBLING_OF'>, RelationshipType> = {
      PARENT_OF: 'PARENT',
      CHILD_OF: 'PARENT',
      SPOUSE_OF: 'SPOUSE',
      GUARDIAN_OF: 'GUARDIAN',
      WARD_OF: 'GUARDIAN',
    };
    // For CHILD_OF and WARD_OF, the *selected* person is the subject (parent/guardian).
    const selectedIsSubject = relationOption === 'CHILD_OF' || relationOption === 'WARD_OF';
    return {
      personId: selectedIsSubject ? selectedPersonId : newPersonId,
      relatedPersonId: selectedIsSubject ? newPersonId : selectedPersonId,
      relationshipType: typeByOption[relationOption],
    };
  }

  private fail(err: unknown): void {
    this.saving.set(false);
    this.errorMessage.set(this.extractMessage(err));
  }

  private extractMessage(err: unknown, siblingTarget?: Person): string {
    if (err instanceof Error && err.message === NO_PARENTS_RECORDED && siblingTarget) {
      return `${personLabel(siblingTarget)} has no parents recorded in this family yet - add a parent relationship for them first, then try marking a sibling.`;
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
