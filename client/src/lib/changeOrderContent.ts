import type {
  DocumentContent,
  ProductionRateBlock,
  UnifiedLineItem,
} from "@shared/schema";

export type ChangeOrderEntry<
  TItem = UnifiedLineItem,
  TBlock = ProductionRateBlock,
> =
  | { type: "block"; block: TBlock }
  | { type: "item"; item: TItem };

export interface OrderedContent<
  TItem = UnifiedLineItem,
  TBlock = ProductionRateBlock,
> {
  items?: TItem[];
  productionRateBlocks?: TBlock[];
  itemOrder?: string[];
}

/**
 * Walk content.itemOrder to interleave production rate blocks and items in
 * saved sequence. The n-th "item" entry maps to items[n] and the n-th "block"
 * entry maps to productionRateBlocks[n]. When itemOrder is missing or empty,
 * falls back to "all blocks, then all items".
 *
 * Generic over the item/block shape so the PDF generator (which uses its own
 * local LineItem interface) can call this without casts.
 */
export function buildOrderedEntries<
  TItem = UnifiedLineItem,
  TBlock = ProductionRateBlock,
>(
  content: OrderedContent<TItem, TBlock> | DocumentContent | undefined | null,
): ChangeOrderEntry<TItem, TBlock>[] {
  const c = (content ?? {}) as OrderedContent<TItem, TBlock>;
  const items: TItem[] = c.items ?? [];
  const blocks: TBlock[] = c.productionRateBlocks ?? [];
  const savedOrder: string[] | undefined = c.itemOrder;

  if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
    const ordered: ChangeOrderEntry<TItem, TBlock>[] = [];
    let bIdx = 0;
    let iIdx = 0;
    for (const t of savedOrder) {
      if (t === "block" && bIdx < blocks.length) {
        ordered.push({ type: "block", block: blocks[bIdx++] });
      } else if (t === "item" && iIdx < items.length) {
        ordered.push({ type: "item", item: items[iIdx++] });
      }
    }
    while (bIdx < blocks.length)
      ordered.push({ type: "block", block: blocks[bIdx++] });
    while (iIdx < items.length)
      ordered.push({ type: "item", item: items[iIdx++] });
    return ordered;
  }

  return [
    ...blocks.map<ChangeOrderEntry<TItem, TBlock>>((block) => ({
      type: "block",
      block,
    })),
    ...items.map<ChangeOrderEntry<TItem, TBlock>>((item) => ({
      type: "item",
      item,
    })),
  ];
}
