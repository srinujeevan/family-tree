import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { HttpErrorResponse } from '@angular/common/http';
import { FamiliesApiService } from '../../../core/services/families-api.service';
import { Family } from '../../../shared/models/family.model';
import { ApiError } from '../../../shared/models/pagination.model';

@Component({
  selector: 'app-create-family-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './create-family-dialog.component.html',
  styleUrl: './create-family-dialog.component.scss',
})
export class CreateFamilyDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly familiesApi = inject(FamiliesApiService);
  private readonly dialogRef = inject(MatDialogRef<CreateFamilyDialogComponent>);

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    familyName: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
  });

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const { familyName, description } = this.form.getRawValue();

    this.familiesApi.create({ familyName, description: description || undefined }).subscribe({
      next: (res: { family: Family }) => {
        this.saving.set(false);
        this.dialogRef.close(res.family);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(
          err instanceof HttpErrorResponse && (err.error as ApiError | undefined)?.error?.message
            ? (err.error as ApiError).error.message
            : 'Could not create the family. Please try again.',
        );
      },
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
