import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { HttpErrorResponse } from '@angular/common/http';
import { PersonsApiService } from '../../../core/services/persons-api.service';
import { RelationshipsApiService, CreateRelationshipPayload } from '../../../core/services/relationships-api.service';
import { Gender, Person } from '../../../shared/models/person.model';
import { RelationshipType } from '../../../shared/models/relationship.model';
import { ApiError } from '../../../shared/models/pagination.model';

export interface AddPersonDialogData {
  familyId: string;
  existingPersons: { id: string; name: string }[];
}

type RelationOption = 'PARENT_OF' | 'CHILD_OF' | 'SPOUSE_OF' | 'GUARDIAN_OF' | 'WARD_OF';

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
  { value: 'SPOUSE_OF', label: 'Spouse of' },
  { value: 'GUARDIAN_OF', label: 'Guardian of' },
  { value: 'WARD_OF', label: 'Ward of (they are the guardian)' },
];

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
  ],
  templateUrl: './add-person-dialog.component.html',
  styleUrl: './add-person-dialog.component.scss',
})
export class AddPersonDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly personsApi = inject(PersonsApiService);
  private readonly relationshipsApi = inject(RelationshipsApiService);
  private readonly dialogRef = inject(MatDialogRef<AddPersonDialogComponent>);
  readonly data = inject<AddPersonDialogData>(MAT_DIALOG_DATA);

  readonly genderOptions = GENDER_OPTIONS;
  readonly relationOptions = RELATION_OPTIONS;

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    middleName: [''],
    lastName: [''],
    surname: [''],
    gender: ['UNKNOWN' as Gender],
    dateOfBirth: [''],
    isBirthDateApproximate: [false],
    dateOfDeath: [''],
    placeOfBirth: [''],
    currentCity: [''],
    occupation: [''],
    description: [''],
    relateEnabled: [false],
    relatedPersonId: [''],
    relationOption: ['PARENT_OF' as RelationOption],
  });

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.controls.relateEnabled.value && !this.form.controls.relatedPersonId.value) {
      this.errorMessage.set('Choose a family member to relate to, or turn off "Add a relation".');
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
        surname: value.surname || undefined,
        gender: value.gender,
        dateOfBirth: value.dateOfBirth || undefined,
        isBirthDateApproximate: value.isBirthDateApproximate,
        dateOfDeath: value.dateOfDeath || undefined,
        placeOfBirth: value.placeOfBirth || undefined,
        currentCity: value.currentCity || undefined,
        occupation: value.occupation || undefined,
        description: value.description || undefined,
      })
      .subscribe({
        next: (res) => this.maybeCreateRelation(res.person, value),
        error: (err: unknown) => this.fail(err),
      });
  }

  private maybeCreateRelation(
    person: Person,
    value: { relateEnabled: boolean; relatedPersonId: string; relationOption: RelationOption },
  ): void {
    if (!value.relateEnabled || !value.relatedPersonId) {
      this.saving.set(false);
      this.dialogRef.close(person);
      return;
    }

    const payload = this.buildRelationshipPayload(person.id, value.relatedPersonId, value.relationOption);
    this.relationshipsApi.create(this.data.familyId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close(person);
      },
      error: (err: unknown) => {
        // The person was created successfully even if the relation failed -
        // close the dialog with that fact rather than losing the work, but
        // surface the relation error so the user knows to add it manually.
        this.saving.set(false);
        this.errorMessage.set(
          `Person created, but the relation could not be added: ${this.extractMessage(err)}`,
        );
      },
    });
  }

  private buildRelationshipPayload(
    newPersonId: string,
    selectedPersonId: string,
    relationOption: RelationOption,
  ): CreateRelationshipPayload {
    const typeByOption: Record<RelationOption, RelationshipType> = {
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

  private extractMessage(err: unknown): string {
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
