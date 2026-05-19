import { LineItemRenderer } from "@/components/LineItemRenderer";
import { ProductionRateBlocksSection } from "@/components/ProductionRateBlockDisplay";
import { buildOrderedEntries } from "@/lib/changeOrderContent";
import type { DocumentContent, ProductionRateBlock } from "@shared/schema";

export { buildOrderedEntries };

interface ChangeOrderContentRendererProps {
  content: DocumentContent | undefined | null;
  mode: "customer" | "internal";
  brandColor?: string | null;
  testIdPrefix?: string;
}

function isBlockFullyHidden(
  block: ProductionRateBlock,
  excludedSurfaces: string[],
  contractorHiddenAreas: string[],
): boolean {
  const areas = block.roomBuilderData?.areaResults || [];
  if (areas.length === 0) return false;
  const rooms = block.roomBuilderData?.rooms || [];
  return areas.every((area: any) => {
    const roomId = area.roomId;
    if (contractorHiddenAreas.includes(`${block.id}:area:${roomId}`)) return true;
    const room = rooms.find((r: any) => r.id === roomId);
    const isOpt = area.isOptional || room?.isOptional;
    if (isOpt) return false;
    const surfaces = area.surfaces || [];
    if (surfaces.length === 0) return false;
    return surfaces.every((s: any) =>
      excludedSurfaces.includes(`${block.id}:${roomId}:${s.key || s.type}`),
    );
  });
}

export function ChangeOrderContentRenderer({
  content,
  mode,
  brandColor,
  testIdPrefix,
}: ChangeOrderContentRendererProps) {
  const entries = buildOrderedEntries(content);
  const proposalDefaults = content?.proposalDisplayDefaults || null;
  let itemCounter = 0;

  if (entries.length === 0) return null;

  // CO content is a frozen snapshot of what the customer signed. In customer
  // mode we apply the same visibility filters that the standalone CO portal
  // page applies, so contractor-hidden areas/surfaces and unaccepted optional
  // areas don't leak into the parent-doc inline view.
  const isCustomer = mode === "customer";
  const excludedSurfaces = (content?.excludedSurfaces ?? []) as string[];
  const contractorHiddenAreas = (content?.contractorHiddenAreas ?? []) as string[];
  const acceptedOptionalAreas = (content?.acceptedOptionalAreas ?? []) as string[];

  return (
    <div className="space-y-4" data-testid={testIdPrefix ? `${testIdPrefix}-entries` : undefined}>
      {entries.map((entry, i) => {
        if (entry.type === "block") {
          if (isCustomer && isBlockFullyHidden(entry.block, excludedSurfaces, contractorHiddenAreas)) {
            return null;
          }
          return (
            <div key={`co-block-${i}`} data-testid={testIdPrefix ? `${testIdPrefix}-block-${i}` : undefined}>
              <ProductionRateBlocksSection
                blocks={[entry.block]}
                brandColor={isCustomer ? brandColor ?? null : null}
                noCard={mode === "internal"}
                isCustomerView={isCustomer}
                excludedSurfaces={isCustomer ? excludedSurfaces : undefined}
                contractorHiddenAreas={isCustomer ? contractorHiddenAreas : undefined}
                acceptedOptionalAreas={isCustomer ? acceptedOptionalAreas : undefined}
              />
            </div>
          );
        }
        const idx = itemCounter++;
        return (
          <div
            key={`co-item-${i}`}
            className={
              isCustomer
                ? "rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-4"
                : "border-b pb-4 last:border-0"
            }
            data-testid={testIdPrefix ? `${testIdPrefix}-item-${idx}` : undefined}
          >
            <LineItemRenderer
              item={entry.item}
              index={idx}
              mode={mode}
              proposalDefaults={proposalDefaults}
              pricesInCents={true}
              brandColor={isCustomer ? brandColor ?? null : null}
            />
          </div>
        );
      })}
    </div>
  );
}
