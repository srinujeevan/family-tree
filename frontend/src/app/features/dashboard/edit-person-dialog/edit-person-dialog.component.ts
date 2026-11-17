import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
  readonly confirmingDelete = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    firstName: [this.data.person.firstName, [Validators.required, Validators.maxLength(100)]],
    middleName: [this.data.person.middleName ?? ''],
    lastName: [this.data.person.lastName ?? ''],
    gender: [this.data.person.gender],
    dateOfBirth: [this.toDateInputValue(this.data.person.dateOfBirth)],
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
        gender: value.gender,
        dateOfBirth: value.dateOfBirth || null,
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

  deletePerson(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.personsApi.remove(this.data.person.id).subscribe({
      next: () => {
        this.saving.set(false);
        // Any truthy result makes the tree view reload.
        this.dialogRef.close({ deleted: true });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.confirmingDelete.set(false);
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
