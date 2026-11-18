import { Observable, forkJoin, switchMap, throwError } from 'rxjs';
import { FamilyTreeApiService } from '../../core/services/family-tree-api.service';
import { CreateRelationshipResponse, RelationshipsApiService } from '../../core/services/relationships-api.service';

export const NO_PARENTS_RECORDED = 'NO_PARENTS_RECORDED';

/**
 * "Sibling of" isn't a stored relationship type - per the schema's design,
 * siblings are derived from shared PARENT edges, never stored directly (see
 * backend/prisma/schema.prisma notes on PersonRelationship). This achieves
 * the same end from the UI: attach `personId` to every recorded parent of
 * `siblingOfPersonId` within this family, which makes them siblings by
 * definition - no new relationship type needed.
 *
 * Fails with a NO_PARENTS_RECORDED error if `siblingOfPersonId` has no
 * parents recorded in this family yet - there's nothing to attach to.
 */
export function relateAsSibling(
  familyTreeApi: FamilyTreeApiService,
  relationshipsApi: RelationshipsApiService,
  familyId: string,
  personId: string,
  siblingOfPersonId: string,
): Observable<CreateRelationshipResponse[]> {
  return familyTreeApi.getAncestors(familyId, siblingOfPersonId).pipe(
    switchMap((res) => {
      const parents = res.data.filter((p) => p.depth === 1);
      if (parents.length === 0) {
        return throwError(() => new Error(NO_PARENTS_RECORDED));
      }
      return forkJoin(
        parents.map((parent) =>
          relationshipsApi.create(familyId, {
            personId: parent.id,
            relatedPersonId: personId,
            relationshipType: 'PARENT',
          }),
        ),
      );
    }),
  );
}
