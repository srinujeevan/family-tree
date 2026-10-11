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
import { Gender, Person } from '../../../shared/models/person.model';
import { ApiError } from '../../../shared/models/pagination.model';

export interface EditPersonDialogData {
  person: Person;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];

@Component({
  selector: 'app-edit-person-dialog',
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
  templateUrl: './edit-person-dialog.component.html',
  styleUrl: './edit-person-dialog.component.scss',
})
export class EditPersonDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly personsApi = inject(PersonsApiService);
  private readonly dialogRef = inject(MatDialogRef<EditPersonDialogComponent>);
  readonly data = inject<EditPersonDialogData>(MAT_DIALOG_DATA);

  readonly genderOptions = GENDER_OPTIONS;
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    firstName: [this.data.person.firstName, [Validators.required, Validators.maxLength(100)]],
    middleName: [this.data.person.middleName ?? ''],
    lastName: [this.data.person.lastName ?? ''],
    surname: [this.data.person.surname ?? ''],
    gender: [this.data.person.gender],
    dateOfBirth: [this.toDateInputValue(this.data.person.dateOfBirth)],
    isBirthDateApproximate: [this.data.person.isBirthDateApproximate],
    dateOfDeath: [this.toDateInputValue(this.data.person.dateOfDeath)],
    placeOfBirth: [this.data.person.placeOfBirth ?? ''],
    currentCity: [this.data.person.currentCity ?? ''],
    occupation: [this.data.person.occupation ?? ''],
    description: [this.data.person.description ?? ''],
  });

  private toDateInputValue(value: string | null): string {
    return value ? value.slice(0, 10) : '';
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    this.personsApi
      .update(this.data.person.id, {
        firstName: value.firstName,
        middleName: value.middleName || null,
        lastName: value.lastName || null,
        surname: value.surname || null,
        gender: value.gender,
        dateOfBirth: value.dateOfBirth || null,
        isBirthDateApproximate: value.isBirthDateApproximate,
        dateOfDeath: value.dateOfDeath || null,
        placeOfBirth: value.placeOfBirth || null,
        currentCity: value.currentCity || null,
        occupation: value.occupation || null,
        description: value.description || null,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.dialogRef.close(res.person);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.extractMessage(err));
        },
      });
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
