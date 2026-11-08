import {
  type CatalogProductDto,
  type CatalogProviderDto,
  type CatalogResponse,
  type CatalogVariantDto,
  formatToman,
  toman,
} from '@abis/shared';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { fa, formatDuration } from '../ui';
import { ProductForm, ProviderForm, VariantForm, deliveryLabels } from './forms';

type Editing =
  | { kind: 'provider'; provider?: CatalogProviderDto }
  | { kind: 'product'; providerId: number; product?: CatalogProductDto }
  | { kind: 'variant'; productId: number; variant?: CatalogVariantDto };

export function CatalogPage() {
  const [providers, setProviders] = useState<CatalogProviderDto[]>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<Editing>();

  const load = useCallback(() => {
    apiFetch<CatalogResponse>('/catalog')
      .then((res) => setProviders(res.providers))
      .catch((err: unknown) => setError(String(err)));
  }, []);
  useEffect(load, [load]);

  const saved = () => {
    setEditing(undefined);
    load();
  };

  if (error) return <p className="error">{error}</p>;
  if (!providers) return <p className="muted">در حال بارگذاری…</p>;

  return (
    <section>
      <header className="section-header">
        <h2>کاتالوگ</h2>
        <button type="button" onClick={() => setEditing({ kind: 'provider' })}>
          + شرکت
        </button>
      </header>

      {providers.length === 0 && <p className="muted">هنوز شرکتی اضافه نشده است.</p>}

      {providers.map((provider) => (
        <article key={provider.id} className={`card ${provider.isActive ? '' : 'inactive'}`}>
          <header className="card-header">
            <h3>
              {provider.emoji} {provider.name}
              {!provider.isActive && <span className="tag">غیرفعال</span>}
            </h3>
            <div className="row">
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing({ kind: 'provider', provider })}
              >
                ویرایش
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing({ kind: 'product', providerId: provider.id })}
              >
                + محصول
              </button>
            </div>
          </header>

          {provider.products.map((product) => (
            <div key={product.id} className={`product ${product.isActive ? '' : 'inactive'}`}>
              <div className="card-header">
                <div>
                  <strong>{product.name}</strong>{' '}
                  <span className="tag">{deliveryLabels[product.deliveryMethod]}</span>
                  {product.isFeatured && <span className="tag accent">ویژه</span>}
                  {!product.isActive && <span className="tag">غیرفعال</span>}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setEditing({ kind: 'product', providerId: provider.id, product })
                    }
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setEditing({ kind: 'variant', productId: product.id })}
                  >
                    + مدت
                  </button>
                </div>
              </div>

              {product.variants.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>مدت</th>
                      <th>قیمت</th>
                      <th>موجودی</th>
                      <th>فروش</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant) => (
                      <tr key={variant.id} className={variant.isActive ? '' : 'inactive'}>
                        <td>{formatDuration(variant.durationDays)}</td>
                        <td>{formatToman(toman(variant.priceToman))}</td>
                        <td>
                          {variant.stock === null ? '—' : fa(variant.stock)}
                          {variant.stock === 0 && ' ⚠️'}
                        </td>
                        <td>{fa(variant.soldCount)}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setEditing({ kind: 'variant', productId: product.id, variant })
                            }
                          >
                            ✎
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </article>
      ))}

      {editing && (
        <EditDialog editing={editing} onClose={() => setEditing(undefined)} onSaved={saved} />
      )}
    </section>
  );
}

function EditDialog(props: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const { editing, onClose, onSaved } = props;
  switch (editing.kind) {
    case 'provider': {
      const p = editing.provider;
      return (
        <ProviderForm
          id={p?.id}
          initial={{
            name: p?.name ?? '',
            emoji: p?.emoji ?? '🤖',
            sortOrder: p?.sortOrder ?? 0,
            isActive: p?.isActive ?? true,
          }}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    }
    case 'product': {
      const p = editing.product;
      return (
        <ProductForm
          id={p?.id}
          initial={{
            providerId: editing.providerId,
            name: p?.name ?? '',
            description: p?.description ?? '',
            deliveryMethod: p?.deliveryMethod ?? 'email_activation',
            requiredFields: p?.requiredFields ?? ['email'],
            warrantyDays: p?.warrantyDays ?? 30,
            etaMinutes: p?.etaMinutes ?? 30,
            isFeatured: p?.isFeatured ?? false,
            isActive: p?.isActive ?? true,
            sortOrder: p?.sortOrder ?? 0,
          }}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    }
    case 'variant': {
      const v = editing.variant;
      return (
        <VariantForm
          id={v?.id}
          initial={{
            productId: editing.productId,
            durationDays: v?.durationDays ?? 30,
            priceToman: v?.priceToman ?? 0,
            isActive: v?.isActive ?? true,
          }}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    }
  }
}
