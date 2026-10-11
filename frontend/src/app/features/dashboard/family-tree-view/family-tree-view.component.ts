import { Component, computed, effect, inject, input, signal } from '@angular/core';
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

@Component({
  selector: 'app-family-tree-view',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, MatProgressSpinnerModule, MatDialogModule],
  templateUrl: './family-tree-view.component.html',
  styleUrl: './family-tree-view.component.scss',
})
export class FamilyTreeViewComponent {
  readonly familyId = input.required<string>();

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

  displayName(person: Person): string {
    return [person.firstName, person.lastName].filter(Boolean).join(' ');
  }

  lifespan(person: Person): string {
    const birth = person.dateOfBirth ? new Date(person.dateOfBirth).getFullYear() : '?';
    if (!person.isLiving) {
      const death = person.dateOfDeath ? new Date(person.dateOfDeath).getFullYear() : '?';
      return `${birth} - ${death}`;
    }
    return `b. ${birth}`;
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
