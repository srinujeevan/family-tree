import { Component, inject, signal } from '@angular/core';
import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { FamiliesApiService } from '../../core/services/families-api.service';
import { PersonsApiService } from '../../core/services/persons-api.service';
import { PermissionRole } from '../../shared/models/family.model';
import { AddPersonDialogComponent } from './add-person-dialog/add-person-dialog.component';
import { CreateFamilyDialogComponent } from './create-family-dialog/create-family-dialog.component';

interface TreeNode {
  id: string;
  name: string;
  detail?: string;
  type: 'family' | 'person';
  children?: TreeNode[];
  /** Only set on family nodes - the caller's own role on that family. */
  callerRole?: PermissionRole | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatTreeModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly familiesApi = inject(FamiliesApiService);
  private readonly personsApi = inject(PersonsApiService);
  private readonly dialog = inject(MatDialog);

  readonly currentUser = this.auth.currentUser;
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly treeControl = new NestedTreeControl<TreeNode>((node) => node.children ?? []);
  readonly dataSource = new MatTreeNestedDataSource<TreeNode>();

  constructor() {
    this.loadTree();
  }

  hasChild = (_: number, node: TreeNode): boolean => !!node.children && node.children.length > 0;
  isFamilyNode = (_: number, node: TreeNode): boolean => node.type === 'family';
  canEditFamily = (node: TreeNode): boolean => node.callerRole === 'OWNER' || node.callerRole === 'EDITOR';

  loadTree(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.familiesApi.list().subscribe({
      next: (familiesPage) => {
        if (familiesPage.data.length === 0) {
          this.dataSource.data = [];
          this.loading.set(false);
          return;
        }

        const branches = familiesPage.data.map((family) =>
          this.personsApi.listInFamily(family.id).pipe(
            map(
              (personsPage): TreeNode => ({
                id: family.id,
                name: family.familyName,
                detail: `${family.memberCount} member${family.memberCount === 1 ? '' : 's'}`,
                type: 'family',
                callerRole: family.callerRole,
                children: personsPage.data.map(
                  (person): TreeNode => ({
                    id: person.id,
                    name: [person.firstName, person.lastName].filter(Boolean).join(' '),
                    detail: person.dateOfBirth ? `b. ${new Date(person.dateOfBirth).getFullYear()}` : undefined,
                    type: 'person',
                  }),
                ),
              }),
            ),
            catchError(() =>
              of<TreeNode>({
                id: family.id,
                name: family.familyName,
                detail: `${family.memberCount} member${family.memberCount === 1 ? '' : 's'}`,
                type: 'family',
                callerRole: family.callerRole,
                children: [],
              }),
            ),
          ),
        );

        forkJoin(branches).subscribe({
          next: (nodes) => {
            this.dataSource.data = nodes;
            // Expand every family branch by default so the tree isn't empty-looking on load.
            nodes.forEach((node) => this.treeControl.expand(node));
            this.loading.set(false);
          },
          error: () => {
            this.loadError.set('Could not load family members.');
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loadError.set('Could not load your family trees.');
        this.loading.set(false);
      },
    });
  }

  openCreateFamilyDialog(): void {
    const ref = this.dialog.open(CreateFamilyDialogComponent, { width: '420px' });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        this.loadTree();
      }
    });
  }

  openAddPersonDialog(familyNode: TreeNode, event: Event): void {
    event.stopPropagation(); // don't toggle the tree node's expand/collapse
    const ref = this.dialog.open(AddPersonDialogComponent, {
      width: '480px',
      data: {
        familyId: familyNode.id,
        existingPersons: (familyNode.children ?? []).map((child) => ({ id: child.id, name: child.name })),
      },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        this.loadTree();
      }
    });
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
