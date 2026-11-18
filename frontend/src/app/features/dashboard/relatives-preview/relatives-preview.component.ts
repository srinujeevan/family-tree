import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdditionReason, PreviewPerson } from '../../../core/services/relationships-api.service';

const REASON_LABELS: Record<AdditionReason, string> = {
  linked: 'being linked',
  descendant: 'descendant',
  spouse: 'spouse of a descendant',
};

/**
 * Shown inside the Add person / Add relation dialogs before saving a link
 * that would bring relatives along, so a wrong pick is caught before
 * anything changes. Emits the user's choice; the dialog does the saving.
 */
@Component({
  selector: 'app-relatives-preview',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="preview" role="region" aria-label="People that will be added">
      <p class="headline">
        <mat-icon aria-hidden="true">group_add</mat-icon>
        <span>
          This will also add <strong>{{ relatives().length }}</strong>
          {{ relatives().length === 1 ? 'relative' : 'relatives' }} of {{ linkedName() }} to this family:
        </span>
      </p>
      <ul class="people">
        @for (person of relatives(); track person.id) {
          <li>
            <span class="name">{{ person.firstName }} {{ person.lastName ?? '' }}</span>
            <span class="reason">{{ reasonLabel(person.reason) }}</span>
          </li>
        }
      </ul>
      <p class="hint">Not who you meant? Go back and pick someone else - nothing has been saved yet.</p>
      <div class="actions">
        <button mat-button type="button" (click)="back.emit()" [disabled]="saving()">Back</button>
        <button mat-stroked-button type="button" (click)="linkOnly.emit()" [disabled]="saving()">Link only</button>
        <button mat-flat-button color="primary" type="button" (click)="addAll.emit()" [disabled]="saving()">
          Link and add all
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
      margin: 0 0 8px;
    }
    .people {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 180px;
      overflow: auto;
      border-top: 1px solid var(--mat-sys-outline-variant, #c4c6d0);
    }
    .people li {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 2px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #c4c6d0);
    }
    .reason {
      color: var(--mat-sys-on-surface-variant, #44474f);
      white-space: nowrap;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant, #44474f);
      margin: 8px 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class RelativesPreviewComponent {
  /** Everyone the preview endpoint returned (including the linked person). */
  readonly people = input.required<PreviewPerson[]>();
  readonly saving = input(false);
  readonly addAll = output<void>();
  readonly linkOnly = output<void>();
  readonly back = output<void>();

  /** The extra people - the linked person themselves joins either way. */
  readonly relatives = computed(() => this.people().filter((p) => p.reason !== 'linked'));
  readonly linkedName = computed(() => {
    const linked = this.people().find((p) => p.reason === 'linked');
    return linked ? linked.firstName : 'this person';
  });

  reasonLabel(reason: AdditionReason): string {
    return REASON_LABELS[reason];
  }
}
