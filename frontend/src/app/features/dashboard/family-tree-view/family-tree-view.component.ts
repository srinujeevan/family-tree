import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FamilyTreeApiService } from '../../../core/services/family-tree-api.service';
import { Person } from '../../../shared/models/person.model';
import { AddPersonDialogComponent } from '../add-person-dialog/add-person-dialog.component';
import { EditPersonDialogComponent } from '../edit-person-dialog/edit-person-dialog.component';
import { AddRelationDialogComponent } from '../add-relation-dialog/add-relation-dialog.component';
import { buildTreeLayout, LayoutNode, NODE_RADIUS, TreeLayout } from './tree-layout';
import { exportTreeSvgToPdf } from './tree-pdf-export';

@Component({
  selector: 'app-family-tree-view',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, MatProgressSpinnerModule, MatDialogModule],
  templateUrl: './family-tree-view.component.html',
  styleUrl: './family-tree-view.component.scss',
})
export class FamilyTreeViewComponent {
  readonly familyId = input.required<string>();
  /** Used as the PDF title and file name. */
  readonly familyName = input<string>('Family Tree');

  private readonly treeSvg = viewChild<ElementRef<SVGSVGElement>>('treeSvg');
  readonly exporting = signal(false);
  readonly exportError = signal<string | null>(null);

  private readonly treeApi = inject(FamilyTreeApiService);
  private readonly dialog = inject(MatDialog);

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
    this.zoom.set(Math.max(0.4, this.zoom() - 0.15));
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
      data: { familyId: this.familyId() },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) this.load();
    });
  }

  openEditPerson(node: LayoutNode): void {
    const ref = this.dialog.open(EditPersonDialogComponent, {
      width: '480px',
      data: { person: node.person },
    });
    ref.afterClosed().subscribe((updated) => {
      if (updated) this.load();
    });
  }

  openAddRelation(node: LayoutNode): void {
    const ref = this.dialog.open(AddRelationDialogComponent, {
      width: '460px',
      data: { familyId: this.familyId(), anchorPerson: { id: node.person.id, name: this.displayName(node.person) } },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) this.load();
    });
  }
}
