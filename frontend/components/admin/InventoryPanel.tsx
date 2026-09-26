"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus, Truck } from "lucide-react";
import { createClient } from "@/frontend/lib/supabase/client";
import type { InventoryCategory, InventoryItem, InventoryTransaction, InventoryTransactionType, Supplier } from "@/shared/types";
import { EmptyState, SectionTitle } from "@/frontend/components/shared/ui";

// Reads/writes inventory_items, inventory_transactions and suppliers
// directly via Supabase — this is real persisted data, not the mock store
// (frontend/lib/store.tsx addInventoryItem / recordInventoryTransaction /
// addSupplier). See backend/database/025_inventory.sql for schema + RLS and
// backend/database/026_inventory_transaction_rpc.sql for the transaction
// RPC (stock adjustment + low-stock notification fan-out happen there,
// atomically, since a plain client insert can't also notify admins).
function useInventoryData() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [itemsRes, txRes, suppliersRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, category, unit, quantity_on_hand, reorder_threshold, supplier_id")
        .order("name", { ascending: true }),
      supabase
        .from("inventory_transactions")
        .select("id, item_id, type, quantity, performed_by, note, performed_at")
        .order("performed_at", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id, name, contact_name, phone, email")
        .order("name", { ascending: true }),
    ]);

    const firstError = itemsRes.error || txRes.error || suppliersRes.error;
    if (firstError) {
      setLoadError(firstError.message);
      return;
    }
    setLoadError(null);
    setItems((itemsRes.data ?? []) as InventoryItem[]);
    setTransactions((txRes.data ?? []) as InventoryTransaction[]);
    setSuppliers((suppliersRes.data ?? []) as Supplier[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, transactions, suppliers, loadError, reload: load };
}

export default function InventoryPanel() {
  const { items, transactions, suppliers, loadError, reload } = useInventoryData();
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  const usageByItem = new Map<string, { used: number; wasted: number }>();
  (transactions ?? []).forEach((t) => {
    if (t.type === "stock_in") return;
    const entry = usageByItem.get(t.item_id) ?? { used: 0, wasted: 0 };
    if (t.type === "used") entry.used += t.quantity;
    if (t.type === "wasted") entry.wasted += t.quantity;
    usageByItem.set(t.item_id, entry);
  });

  const loading = !items || !transactions || !suppliers;

  return (
    <section id="inventory" className="card space-y-6 p-5 sm:p-6">
      {loadError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Could not load inventory: {loadError}</p>
      )}
      <div>
        <SectionTitle
          icon={PackagePlus}
          title="Inventory management"
          subtitle="Contrast agents & consumables — stock levels, transactions, low-stock alerts (FR57–FR59)"
          action={
            <button type="button" className="btn-primary text-xs" onClick={() => setShowAddItem((v) => !v)}>
              <PackagePlus size={14} aria-hidden /> Add item
            </button>
          }
        />
        {showAddItem && <AddItemForm suppliers={suppliers ?? []} onDone={() => { setShowAddItem(false); reload(); }} />}

        {loading && !loadError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
        ) : items!.length === 0 ? (
          <EmptyState message="No inventory items yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">On hand</th>
                  <th className="py-2 pr-4">Reorder at</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2">Record transaction</th>
                </tr>
              </thead>
              <tbody>
                {items!.map((item) => {
                  const low = item.quantity_on_hand <= item.reorder_threshold;
                  const supplier = (suppliers ?? []).find((s) => s.id === item.supplier_id);
                  return (
                    <tr key={item.id} className={`border-b border-slate-100 last:border-0 ${low ? "bg-rose-50/50" : ""}`}>
                      <td className="py-2.5 pr-4 font-semibold text-navy">
                        {item.name}
                        {low && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                            <AlertTriangle size={11} aria-hidden /> Low stock
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">{item.quantity_on_hand} {item.unit}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{item.reorder_threshold} {item.unit}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{supplier?.name ?? "—"}</td>
                      <td className="py-2.5"><TransactionForm itemId={item.id} onSaved={reload} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle
          icon={Truck}
          title="Suppliers"
          subtitle="Supplier directory (FR60)"
          action={
            <button type="button" className="btn-ghost text-xs" onClick={() => setShowAddSupplier((v) => !v)}>
              Add supplier
            </button>
          }
        />
        {showAddSupplier && <AddSupplierForm onDone={() => { setShowAddSupplier(false); reload(); }} />}
        {loading && !loadError ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</p>
        ) : suppliers!.length === 0 ? (
          <EmptyState message="No suppliers yet" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {suppliers!.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-navy">{s.name}</p>
                <p className="text-xs text-slate-500">{s.contact_name} · {s.phone}</p>
                <p className="text-xs text-slate-500">{s.email}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 pt-5">
        <SectionTitle icon={AlertTriangle} title="Usage & wastage report" subtitle="FR61 — cumulative usage and wastage per item" />
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Used</th>
              <th className="py-2">Wasted</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => {
              const usage = usageByItem.get(item.id) ?? { used: 0, wasted: 0 };
              return (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 font-semibold text-navy">{item.name}</td>
                  <td className="py-1.5 pr-4">{usage.used} {item.unit}</td>
                  <td className="py-1.5">{usage.wasted} {item.unit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionForm({ itemId, onSaved }: { itemId: string; onSaved: () => void }) {
  const [type, setType] = useState<InventoryTransactionType>("used");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (quantity <= 0) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("record_inventory_transaction", {
      p_item_id: itemId,
      p_type: type,
      p_quantity: quantity,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNote("");
    setQuantity(1);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <select className="input w-24 px-2 py-1 text-xs" value={type} onChange={(e) => setType(e.target.value as InventoryTransactionType)}>
        <option value="stock_in">Stock in</option>
        <option value="used">Used</option>
        <option value="wasted">Wasted</option>
      </select>
      <input type="number" min={1} className="input w-16 px-2 py-1 text-xs" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      <input placeholder="Note" className="input w-28 px-2 py-1 text-xs" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="submit" disabled={busy} className="btn-ghost px-2 py-1 text-xs">{busy ? "Saving…" : "Save"}</button>
      {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      {error && <span className="text-xs font-semibold text-rose-700">{error}</span>}
    </form>
  );
}

function AddItemForm({ suppliers, onDone }: { suppliers: Supplier[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("consumable");
  const [unit, setUnit] = useState("units");
  const [quantity, setQuantity] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("inventory_items").insert({
      name: name.trim(),
      category,
      unit,
      quantity_on_hand: quantity,
      reorder_threshold: threshold,
      supplier_id: supplierId || null,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onDone();
  }

  return (
    <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3" onSubmit={submit}>
      <div>
        <label className="label" htmlFor="inv-name">Item name</label>
        <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="inv-cat">Category</label>
        <select id="inv-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
          <option value="contrast_agent">Contrast agent</option>
          <option value="consumable">Consumable</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="inv-unit">Unit</label>
        <input id="inv-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="inv-qty">Starting quantity</label>
        <input id="inv-qty" type="number" min={0} className="input" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="inv-threshold">Reorder threshold</label>
        <input id="inv-threshold" type="number" min={0} className="input" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="inv-supplier">Supplier</label>
        <select id="inv-supplier" className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">None</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-3">
        <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? "Adding…" : "Add item"}</button>
        {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    </form>
  );
}

function AddSupplierForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("suppliers").insert({
      name: name.trim(),
      contact_name: contactName.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onDone();
  }

  return (
    <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4" onSubmit={submit}>
      <input placeholder="Supplier name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      <input placeholder="Contact name" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      <input placeholder="Phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="Email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="sm:col-span-4">
        <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? "Adding…" : "Add supplier"}</button>
        {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    </form>
  );
}
