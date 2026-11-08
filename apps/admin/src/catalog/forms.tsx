import {
  type DeliveryMethod,
  type ProductInput,
  type ProviderInput,
  type RequiredFieldName,
  type VariantInput,
  deliveryMethods,
  productInput,
  providerInput,
  requiredFieldNames,
  variantInput,
} from '@abis/shared';
import { type FormEvent, useState } from 'react';
import type { z } from 'zod';
import { apiFetch } from '../api';
import { Field, Modal, Toggle } from '../ui';

export const deliveryLabels: Record<DeliveryMethod, string> = {
  link: 'لینک',
  ready_account: 'اکانت آماده',
  email_activation: 'فعال‌سازی روی ایمیل',
};

const requiredFieldLabels: Record<RequiredFieldName, string> = {
  email: 'ایمیل',
  password: 'رمز',
  note: 'توضیح',
};

/** Create (no id) or edit (id) one catalog row, validated with the shared schema. */
function useSave<T>(
  path: string,
  schema: z.ZodType<T>,
  id: number | undefined,
  onSaved: () => void,
) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent, value: T) {
    event.preventDefault();
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      setError('مقادیر فرم معتبر نیستند؛ فیلدها را بررسی کنید.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await apiFetch(id ? `${path}/${id}` : path, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(parsed.data),
      });
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }
  return { save, error, saving };
}

interface FormProps<T> {
  id?: number | undefined;
  initial: T;
  onClose: () => void;
  onSaved: () => void;
}

function Actions(props: { saving: boolean; error: string | undefined; onClose: () => void }) {
  return (
    <>
      {props.error && <p className="error">{props.error}</p>}
      <footer className="modal-actions">
        <button type="submit" disabled={props.saving}>
          {props.saving ? 'در حال ذخیره…' : 'ذخیره'}
        </button>
        <button type="button" className="ghost" onClick={props.onClose}>
          انصراف
        </button>
      </footer>
    </>
  );
}

export function ProviderForm({ id, initial, onClose, onSaved }: FormProps<ProviderInput>) {
  const [value, setValue] = useState(initial);
  const { save, error, saving } = useSave('/providers', providerInput, id, onSaved);
  return (
    <Modal title={id ? 'ویرایش شرکت' : 'شرکت جدید'} onClose={onClose}>
      <form onSubmit={(e) => void save(e, value)}>
        <Field label="نام">
          <input
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="ایموجی">
          <input
            value={value.emoji}
            onChange={(e) => setValue({ ...value, emoji: e.target.value })}
          />
        </Field>
        <Field label="ترتیب نمایش" hint="عدد کمتر = بالاتر">
          <input
            type="number"
            value={value.sortOrder}
            onChange={(e) => setValue({ ...value, sortOrder: Number(e.target.value) })}
          />
        </Field>
        <Toggle
          label="فعال"
          checked={value.isActive}
          onChange={(isActive) => setValue({ ...value, isActive })}
        />
        <Actions saving={saving} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function ProductForm({ id, initial, onClose, onSaved }: FormProps<ProductInput>) {
  const [value, setValue] = useState(initial);
  const { save, error, saving } = useSave('/products', productInput, id, onSaved);
  const isEmail = value.deliveryMethod === 'email_activation';

  function toggleField(field: RequiredFieldName, on: boolean) {
    const fields = new Set(value.requiredFields);
    if (on) fields.add(field);
    else fields.delete(field);
    setValue({ ...value, requiredFields: requiredFieldNames.filter((f) => fields.has(f)) });
  }

  return (
    <Modal title={id ? 'ویرایش محصول' : 'محصول جدید'} onClose={onClose}>
      <form onSubmit={(e) => void save(e, value)}>
        <Field label="نام">
          <input
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="نوع تحویل">
          <select
            value={value.deliveryMethod}
            onChange={(e) =>
              setValue({ ...value, deliveryMethod: e.target.value as DeliveryMethod })
            }
          >
            {deliveryMethods.map((method) => (
              <option key={method} value={method}>
                {deliveryLabels[method]}
              </option>
            ))}
          </select>
        </Field>
        {isEmail && (
          <Field label="اطلاعاتی که از مشتری پرسیده می‌شود">
            <div className="row">
              {requiredFieldNames.map((field) => (
                <Toggle
                  key={field}
                  label={requiredFieldLabels[field]}
                  checked={value.requiredFields.includes(field)}
                  onChange={(on) => toggleField(field, on)}
                />
              ))}
            </div>
          </Field>
        )}
        <Field label="توضیحات" hint="قالب HTML تلگرام مجاز است: <b> <i> <code>">
          <textarea
            rows={5}
            value={value.description}
            onChange={(e) => setValue({ ...value, description: e.target.value })}
          />
        </Field>
        <Field label="گارانتی (روز)" hint="۰ = بدون گارانتی">
          <input
            type="number"
            min={0}
            value={value.warrantyDays}
            onChange={(e) => setValue({ ...value, warrantyDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="زمان تقریبی تحویل دستی (دقیقه)" hint="خالی = نامشخص">
          <input
            type="number"
            min={1}
            value={value.etaMinutes ?? ''}
            onChange={(e) =>
              setValue({
                ...value,
                etaMinutes: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="ترتیب نمایش">
          <input
            type="number"
            value={value.sortOrder}
            onChange={(e) => setValue({ ...value, sortOrder: Number(e.target.value) })}
          />
        </Field>
        <div className="row">
          <Toggle
            label="ویژه"
            checked={value.isFeatured}
            onChange={(isFeatured) => setValue({ ...value, isFeatured })}
          />
          <Toggle
            label="فعال"
            checked={value.isActive}
            onChange={(isActive) => setValue({ ...value, isActive })}
          />
        </div>
        <Actions saving={saving} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function VariantForm({ id, initial, onClose, onSaved }: FormProps<VariantInput>) {
  const [value, setValue] = useState(initial);
  const { save, error, saving } = useSave('/variants', variantInput, id, onSaved);
  return (
    <Modal title={id ? 'ویرایش مدت و قیمت' : 'مدت جدید'} onClose={onClose}>
      <form onSubmit={(e) => void save(e, value)}>
        <Field label="مدت (روز)" hint="۳۰ = ۱ ماهه، ۹۰ = ۳ ماهه، ۳۶۰ = ۱۲ ماهه">
          <input
            type="number"
            min={1}
            value={value.durationDays}
            onChange={(e) => setValue({ ...value, durationDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="قیمت (تومان)">
          <input
            type="number"
            min={1}
            value={value.priceToman}
            onChange={(e) => setValue({ ...value, priceToman: Number(e.target.value) })}
          />
        </Field>
        <Toggle
          label="فعال"
          checked={value.isActive}
          onChange={(isActive) => setValue({ ...value, isActive })}
        />
        <Actions saving={saving} error={error} onClose={onClose} />
      </form>
    </Modal>
  );
}
