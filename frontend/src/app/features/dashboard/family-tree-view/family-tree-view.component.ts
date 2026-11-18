import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of, switchMap } from 'rxjs';
import { FamilyTreeApiService } from '../../../core/services/family-tree-api.service';
import { PersonsApiService } from '../../../core/services/persons-api.service';
import { RelationshipsApiService } from '../../../core/services/relationships-api.service';
import { LinkResult } from '../link-result';
import { Person } from '../../../shared/models/person.model';
import { AddPersonDialogComponent } from '../add-person-dialog/add-person-dialog.component';
import { EditPersonDialogComponent } from '../edit-person-dialog/edit-person-dialog.component';
import { AddRelationDialogComponent } from '../add-relation-dialog/add-relation-dialog.component';
import { buildTreeLayout, LayoutNode, NODE_RADIUS, TreeLayout } from './tree-layout';
import { exportTreeSvgToPdf } from './tree-pdf-export';

@Component({
  selector: 'app-family-tree-view',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './family-tree-view.component.html',
  styleUrl: './family-tree-view.component.scss',
})
export class FamilyTreeViewComponent {
  readonly familyId = input.required<string>();
  /** Used as the PDF title and file name. */
  readonly familyName = input<string>('Family Tree');
  /** Fired after people were added, linked, deleted or an action was undone - so member counts can refresh. */
  readonly membersChanged = output<void>();

  private readonly treeSvg = viewChild<ElementRef<SVGSVGElement>>('treeSvg');
  private readonly svgScroll = viewChild<ElementRef<HTMLDivElement>>('svgScroll');
  private readonly injector = inject(Injector);
  /** True until the first load of the current family has been fitted to the screen. */
  private fitPending = true;
  readonly exporting = signal(false);
  readonly exportError = signal<string | null>(null);

  private readonly treeApi = inject(FamilyTreeApiService);
  private readonly relationshipsApi = inject(RelationshipsApiService);
  private readonly personsApi = inject(PersonsApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly nodeRadius = NODE_RADIUS;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly layout = signal<TreeLayout | null>(null);
  readonly zoom = signal(1);

  readonly viewBox = computed(() => {
    const l = this.layout();
    return l ? `0 0 ${l.width} ${l.height}` : '0 0 100 100';
  });

  constructor() {
    effect(() => {
      this.familyId(); // track
      this.fitPending = true;
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.treeApi.getTree(this.familyId()).subscribe({
      next: (res) => {
        this.layout.set(buildTreeLayout(res.nodes, res.edges));
        this.loading.set(false);
        // Only on the first load of a family - reloads after adding/editing
        // someone keep the zoom and scroll position the user chose.
        if (this.fitPending) {
          this.fitPending = false;
          afterNextRender(() => this.fitToScreen(), { injector: this.injector });
        }
      },
      error: () => {
        this.loadError.set('Could not load this family tree.');
        this.loading.set(false);
      },
    });
  }

  zoomIn(): void {
    this.zoom.set(Math.min(2, this.zoom() + 0.15));
  }

  zoomOut(): void {
    this.zoom.set(Math.max(0.25, this.zoom() - 0.15));
  }

  /**
   * On narrow screens (phones), shrink a wide tree to fit the width - but not
   * below 60%, where names become hard to read - then center the scroll
   * position so the user starts in the middle of the tree, not its left edge.
   */
  private fitToScreen(): void {
    const box = this.svgScroll()?.nativeElement;
    const layout = this.layout();
    if (!box || !layout) {
      return;
    }
    const fit = box.clientWidth / layout.width;
    this.zoom.set(Math.min(1, Math.max(0.6, Math.round(fit * 100) / 100)));
    afterNextRender(
      () => {
        box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
      },
      { injector: this.injector },
    );
  }

  resetZoom(): void {
    this.zoom.set(1);
  }

  async downloadPdf(): Promise<void> {
    const svg = this.treeSvg()?.nativeElement;
    const layout = this.layout();
    if (!svg || !layout || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const name = this.familyName();
      const safeName = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'family-tree';
      const date = new Date().toISOString().slice(0, 10);
      await exportTreeSvgToPdf(svg, { width: layout.width, height: layout.height }, name, `${safeName}-${date}.pdf`);
    } catch {
      this.exportError.set('Could not create the PDF. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  displayName(person: Person): string {
    return [person.firstName, person.lastName].filter(Boolean).join(' ');
  }

  lifespan(person: Person): string {
    // Returns '' when no dates are known, so the tree shows no placeholder like "b. ?".
    const birth = person.dateOfBirth ? new Date(person.dateOfBirth).getFullYear() : null;
    const death = !person.isLiving && person.dateOfDeath ? new Date(person.dateOfDeath).getFullYear() : null;
    if (birth && death) {
      return `${birth} - ${death}`;
    }
    if (birth) {
      return `b. ${birth}`;
    }
    if (death) {
      return `d. ${death}`;
    }
    return '';
  }

  initials(person: Person): string {
    const first = person.firstName.charAt(0);
    const last = person.lastName?.charAt(0) ?? '';
    return (first + last).toUpperCase();
  }

  openAddPerson(): void {
    const ref = this.dialog.open(AddPersonDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data: { familyId: this.familyId() },
    });
    ref.afterClosed().subscribe((result?: LinkResult) => {
      if (result) {
        this.load();
        this.membersChanged.emit();
        this.offerUndo(result);
      }
    });
  }

  openEditPerson(node: LayoutNode): void {
    const ref = this.dialog.open(EditPersonDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data: { person: node.person },
    });
    ref.afterClosed().subscribe((updated) => {
      if (updated) {
        this.load();
        this.membersChanged.emit();
      }
    });
  }

  openAddRelation(node: LayoutNode): void {
    const ref = this.dialog.open(AddRelationDialogComponent, {
      width: '460px',
      maxWidth: '95vw',
      data: { familyId: this.familyId(), anchorPerson: { id: node.person.id, name: this.displayName(node.person) } },
    });
    ref.afterClosed().subscribe((result?: LinkResult) => {
      if (result) {
        this.load();
        this.membersChanged.emit();
        this.offerUndo(result);
      }
    });
  }

  /**
   * 10-second "UNDO" bar after adding someone or linking relatives. UNDO
   * removes the new relationship(s), takes the people that action added back
   * out of this family (they stay in their own families), and deletes the
   * person if the action created one.
   */
  private offerUndo(result: LinkResult): void {
    const familyId = this.familyId();
    const { relationshipIds, addedPersonIds, addedElsewhere, createdPersonId } = result.undo;
    this.snackBar
      .open(result.message, 'UNDO', { duration: 10_000 })
      .onAction()
      .pipe(
        switchMap(() =>
          relationshipIds.length || addedPersonIds.length || addedElsewhere.length
            ? this.relationshipsApi.undoLink(familyId, relationshipIds, addedPersonIds, addedElsewhere)
            : of(undefined),
        ),
        switchMap(() => (createdPersonId ? this.personsApi.remove(createdPersonId) : of(undefined))),
      )
      .subscribe({
        next: () => {
          this.load();
          this.membersChanged.emit();
          this.snackBar.open('Undone.', undefined, { duration: 3000 });
        },
        error: () => {
          this.load();
          this.snackBar.open('Could not undo - please fix it manually.', 'OK', { duration: 6000 });
        },
      });
  }
}
