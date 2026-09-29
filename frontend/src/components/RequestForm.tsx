import { useState } from "react";
import type { LunchItem, PipelineRequest } from "../types";

interface Props {
  request: PipelineRequest;
  onChange: (request: PipelineRequest) => void;
  disabled: boolean;
}

const COMMON_ALLERGENS = ["peanuts", "tree nuts", "shellfish", "gluten", "dairy", "soy", "sesame", "eggs"];

export function RequestForm({ request, onChange, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);

  const total = request.items.reduce((sum, i) => sum + i.price, 0);

  const update = (patch: Partial<PipelineRequest>) => onChange({ ...request, ...patch });

  const updateItem = (index: number, patch: Partial<LunchItem>) => {
    const items = request.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    update({ items });
  };

  const toggleAllergen = (index: number, allergen: string) => {
    const item = request.items[index];
    const has = item.allergens.includes(allergen);
    updateItem(index, {
      allergens: has ? item.allergens.filter((a) => a !== allergen) : [...item.allergens, allergen],
    });
  };

  const addItem = () => update({ items: [...request.items, { name: "New item", price: 0, allergens: [] }] });
  const removeItem = (index: number) => update({ items: request.items.filter((_, i) => i !== index) });

  return (
    <div className="request-form">
      <button className="request-form__toggle" type="button" onClick={() => setExpanded((e) => !e)}>
        {expanded ? "▾ Hide request details" : "▸ Edit request details"}
      </button>

      <div className="request-form__summary">
        <span>
          <strong>{request.employeeName}</strong> · {request.attendees} attendees · budget ${request.teamBudget} ·
          total ${total.toFixed(2)}
        </span>
      </div>

      {expanded && (
        <div className="request-form__fields">
          <div className="field-row">
            <label>
              Requester
              <input
                value={request.employeeName}
                disabled={disabled}
                onChange={(e) => update({ employeeName: e.target.value })}
              />
            </label>
            <label>
              Team budget ($)
              <input
                type="number"
                value={request.teamBudget}
                disabled={disabled}
                onChange={(e) => update({ teamBudget: Number(e.target.value) })}
              />
            </label>
            <label>
              Attendees
              <input
                type="number"
                value={request.attendees}
                disabled={disabled}
                onChange={(e) => update({ attendees: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="items-editor">
            {request.items.map((item, index) => (
              <div key={index} className="item-editor">
                <div className="item-editor__main">
                  <input
                    className="item-editor__name"
                    value={item.name}
                    disabled={disabled}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                  />
                  <input
                    className="item-editor__price"
                    type="number"
                    value={item.price}
                    disabled={disabled}
                    onChange={(e) => updateItem(index, { price: Number(e.target.value) })}
                  />
                  <button
                    className="item-editor__remove"
                    type="button"
                    disabled={disabled}
                    onClick={() => removeItem(index)}
                    aria-label="Remove item"
                  >
                    ✕
                  </button>
                </div>
                <div className="item-editor__allergens">
                  {COMMON_ALLERGENS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={disabled}
                      className={`allergen-chip ${item.allergens.includes(a) ? "on" : ""}`}
                      onClick={() => toggleAllergen(index, a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button className="add-item" type="button" disabled={disabled} onClick={addItem}>
              + Add item
            </button>
          </div>

          <label className="note-field">
            Note
            <input
              value={request.note ?? ""}
              disabled={disabled}
              onChange={(e) => update({ note: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
