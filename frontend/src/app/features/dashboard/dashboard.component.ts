import { Component, computed, inject, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FamiliesApiService } from '../../core/services/families-api.service';
import { Family } from '../../shared/models/family.model';
import { CreateFamilyDialogComponent } from './create-family-dialog/create-family-dialog.component';
import { FamilyTreeViewComponent } from './family-tree-view/family-tree-view.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatChipsModule,
    FamilyTreeViewComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly familiesApi = inject(FamiliesApiService);
  private readonly dialog = inject(MatDialog);

  readonly currentUser = this.auth.currentUser;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly families = signal<Family[]>([]);
  readonly selectedFamilyId = signal<string | null>(null);
  readonly selectedFamilyName = computed(
    () => this.families().find((f) => f.id === this.selectedFamilyId())?.familyName ?? 'Family Tree',
  );

  constructor() {
    this.loadFamilies();
  }

  loadFamilies(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.familiesApi.list().subscribe({
      next: (page) => {
        this.families.set(page.data);
        if (!page.data.some((f) => f.id === this.selectedFamilyId())) {
          this.selectedFamilyId.set(page.data[0]?.id ?? null);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load your family trees.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Re-fetches member counts after people are added/linked/removed in the
   * tree. Deliberately skips the loading state - toggling it would unmount
   * and reload the tree the user is looking at.
   */
  refreshCounts(): void {
    this.familiesApi.list().subscribe({
      next: (page) => this.families.set(page.data),
      error: () => undefined,
    });
  }

  selectFamily(familyId: string): void {
    this.selectedFamilyId.set(familyId);
  }

  openCreateFamilyDialog(): void {
    const ref = this.dialog.open(CreateFamilyDialogComponent, { width: '420px', maxWidth: '95vw' });
    ref.afterClosed().subscribe((created: Family | undefined) => {
      if (created) {
        this.loadFamilies();
        this.selectedFamilyId.set(created.id);
      }
    });
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
