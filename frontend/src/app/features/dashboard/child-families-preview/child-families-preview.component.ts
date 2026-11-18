import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { ChildFamilyPreview } from '../../../core/services/relationships-api.service';

/**
 * Shown when making someone a child of a parent who also belongs to other
 * families: "Also add Ravi to these families where Ramesh is a member?" with
 * a checkbox per family (all ticked by default).
 */
@Component({
  selector: 'app-child-families-preview',
  standalone: true,
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  template: `
    <div class="preview" role="region" aria-label="Other families to add the child to">
      <p class="headline">
        <mat-icon aria-hidden="true">account_tree</mat-icon>
        <span>
          <strong>{{ parentName() }}</strong> is also in {{ families().length === 1 ? 'another family' : 'other families' }}.
          Also add <strong>{{ childName() }}</strong> there?
        </span>
      </p>
      <ul class="families">
        @for (family of families(); track family.familyId) {
          <li>
            <mat-checkbox [checked]="selected().has(family.familyId)" (change)="toggle(family.familyId, $event.checked)">
              {{ family.familyName }}
              @if (family.people.length > 1) {
                <span class="extra">(with {{ family.people.length - 1 }} {{ family.people.length === 2 ? 'relative' : 'relatives' }})</span>
              }
            </mat-checkbox>
          </li>
        }
      </ul>
      <div class="actions">
        <button mat-button type="button" (click)="back.emit()" [disabled]="saving()">Back</button>
        <button mat-stroked-button type="button" (click)="skip.emit()" [disabled]="saving()">Skip</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="confirm.emit(selectedIds())"
          [disabled]="saving() || selectedIds().length === 0"
        >
          Add to {{ selectedIds().length }} {{ selectedIds().length === 1 ? 'family' : 'families' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .preview {
      border: 1px solid var(--mat-sys-outline-variant, #c4c6d0);
      border-radius: 8px;
      padding: 12px;
      margin: 4px 0 8px;
      font-size: 0.875rem;
    }
    .headline {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 0 0 4px;
    }
    .families {
      list-style: none;
      margin: 0 0 8px;
      padding: 0;
      max-height: 200px;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .families li {
      // Room for the checkbox's 48px touch target, so a short list never scrolls.
      min-height: 48px;
      display: flex;
      align-items: center;
    }
    .extra {
      color: var(--mat-sys-on-surface-variant, #44474f);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class ChildFamiliesPreviewComponent {
  readonly families = input.required<ChildFamilyPreview[]>();
  readonly parentName = input.required<string>();
  readonly childName = input.required<string>();
  readonly saving = input(false);
  /** Ids of the ticked families. */
  readonly confirm = output<string[]>();
  readonly skip = output<void>();
  readonly back = output<void>();

  readonly selected = signal<Set<string>>(new Set());
  readonly selectedIds = computed(() => [...this.selected()]);

  constructor() {
    // Everything ticked by default whenever a new list arrives.
    effect(() => this.selected.set(new Set(this.families().map((f) => f.familyId))));
  }

  toggle(familyId: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) next.add(familyId);
    else next.delete(familyId);
    this.selected.set(next);
  }
}
