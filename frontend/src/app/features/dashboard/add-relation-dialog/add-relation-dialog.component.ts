import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PersonsApiService } from '../../../core/services/persons-api.service';
import { RelationshipsApiService, CreateRelationshipPayload } from '../../../core/services/relationships-api.service';
import { Person } from '../../../shared/models/person.model';
import { RelationshipType } from '../../../shared/models/relationship.model';
import { ApiError } from '../../../shared/models/pagination.model';

export interface AddRelationDialogData {
  familyId: string;
  anchorPerson: { id: string; name: string };
}

type RelationOption = 'PARENT_OF' | 'CHILD_OF' | 'SPOUSE_OF' | 'GUARDIAN_OF' | 'WARD_OF';

const RELATION_OPTIONS: { value: RelationOption; label: string }[] = [
  { value: 'PARENT_OF', label: 'Parent of' },
  { value: 'CHILD_OF', label: 'Child of' },
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
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatListModule],
  templateUrl: './add-relation-dialog.component.html',
  styleUrl: './add-relation-dialog.component.scss',
})
export class AddRelationDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly personsApi = inject(PersonsApiService);
  private readonly relationshipsApi = inject(RelationshipsApiService);
  private readonly dialogRef = inject(MatDialogRef<AddRelationDialogComponent>);
  readonly data = inject<AddRelationDialogData>(MAT_DIALOG_DATA);

  readonly relationOptions = RELATION_OPTIONS;
  readonly searchResults = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly personLabel = personLabel;

  readonly form = this.fb.nonNullable.group({
    relationOption: ['PARENT_OF' as RelationOption],
    search: [''],
  });

  constructor() {
    this.form.controls.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => this.personsApi.listAll(term || undefined)),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.searchResults.set(page.data.filter((p) => p.id !== this.data.anchorPerson.id));
      });
    this.personsApi.listAll().subscribe((page) => {
      this.searchResults.set(page.data.filter((p) => p.id !== this.data.anchorPerson.id));
    });
  }

  selectPerson(person: Person): void {
    this.selectedPerson.set(person);
  }

  submit(): void {
    const selected = this.selectedPerson();
    if (!selected) {
      this.errorMessage.set('Choose a person to relate to.');
      return;
    }
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const { relationOption } = this.form.getRawValue();
    const payload = this.buildPayload(selected.id, relationOption);

    this.relationshipsApi.create(this.data.familyId, payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dialogRef.close(res.relationship);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.extractMessage(err));
      },
    });
  }

  private buildPayload(selectedPersonId: string, relationOption: RelationOption): CreateRelationshipPayload {
    const typeByOption: Record<RelationOption, RelationshipType> = {
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
