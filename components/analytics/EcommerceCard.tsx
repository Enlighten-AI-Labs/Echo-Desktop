import React from 'react';
import styles from '@/styles/components/ecommerce-cards.module.css';

interface CustomAttribute {
  label: string;
  value: string | number | boolean;
}

interface EcommerceItem {
  item_id?: string;
  item_name: string;
  price: number;
  quantity: number;
  item_brand?: string;
  item_variant?: string;
  item_category?: string;
  item_category2?: string;
  item_category3?: string;
  item_category4?: string;
  item_category5?: string;
  item_list_id?: string;
  item_list_name?: string;
  affiliation?: string;
  coupon?: string;
  discount?: number;
  item_location_id?: string;
  item_calories?: string;
  item_customized?: boolean;
  item_discounted?: boolean;
  item_customization_amount?: number;
  in_stock?: boolean;
  custom_attributes?: CustomAttribute[];
}

interface EcommerceData {
  eventName: string;
  couponCode: string;
  currency: string;
  uniqueProductsCount: number;
  totalItemsCount: number;
  orderTotal: string;
  items: EcommerceItem[];
}

interface EcommerceCardProps {
  data: EcommerceData;
}

const EcommerceCard: React.FC<EcommerceCardProps> = ({ data }) => {
  return (
    <div className={styles.ecommerceContainer}>
      <div className={styles.ecommerceHeader}>
        <h2>eCommerce</h2>
      </div>

      <div className={styles.ecommerceSummary}>
        <div className={styles.summarySection}>
          <div className={styles.summaryTitle}>ORDER TOTAL</div>
          <div className={`${styles.summaryValue} ${styles.summaryHighlight}`}>
            ${data.orderTotal}
          </div>
        </div>
        <div className={styles.summarySection}>
          <div className={styles.summaryTitle}>ITEMS</div>
          <div className={styles.summaryValue}>
            {data.uniqueProductsCount} Products ({data.totalItemsCount} Items)
          </div>
        </div>
        {data.couponCode && (
          <div className={styles.summarySection}>
            <div className={styles.summaryTitle}>COUPON</div>
            <div className={styles.summaryValue}>{data.couponCode}</div>
          </div>
        )}
        <div className={styles.summarySection}>
          <div className={styles.summaryTitle}>EVENT</div>
          <div className={styles.summaryValue}>{data.eventName}</div>
        </div>
      </div>

      <div className={styles.ecommerceGrid}>
        {data.items.map((item, index) => (
          <div key={`${item.item_id}-${index}`} className={styles.productCard}>
            <div className={styles.cardHeader}>
              <div className={styles.productTitle}>
                <div className={styles.index}>{index + 1}</div>
                <div className={styles.name}>{item.item_name}</div>
              </div>
              <div className={styles.priceQty}>
                <div className={styles.qty}>QTY: {item.quantity}</div>
                <div className={styles.price}>${item.price.toFixed(2)}</div>
              </div>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.infoRow}>
                <div className={styles.infoColumn}>
                  {/* Product Details */}
                  <div className={styles.infoGroup}>
                    <div className={styles.groupTitle}>PRODUCT DETAILS</div>
                    {item.item_id && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>ITEM ID</div>
                        <div className={`${styles.infoValue} ${styles.idValue}`}>{item.item_id}</div>
                      </div>
                    )}
                    {item.item_brand && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>BRAND</div>
                        <div className={styles.infoValue}>{item.item_brand}</div>
                      </div>
                    )}
                    {item.item_variant && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>VARIANT</div>
                        <div className={styles.infoValue}>{item.item_variant}</div>
                      </div>
                    )}
                    {item.item_calories && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>CALORIES</div>
                        <div className={styles.infoValue}>{item.item_calories}</div>
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {(item.item_category || item.item_category2 || item.item_category3 || 
                    item.item_category4 || item.item_category5) && (
                    <div className={styles.infoGroup}>
                      <div className={styles.groupTitle}>CATEGORIES</div>
                      {item.item_category && (
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>CATEGORY</div>
                          <div className={styles.infoValue}>{item.item_category}</div>
                        </div>
                      )}
                      {item.item_category2 && (
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>CATEGORY2</div>
                          <div className={styles.infoValue}>{item.item_category2}</div>
                        </div>
                      )}
                      {item.item_category3 && (
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>CATEGORY3</div>
                          <div className={styles.infoValue}>{item.item_category3}</div>
                        </div>
                      )}
                      {item.item_category4 && (
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>CATEGORY4</div>
                          <div className={styles.infoValue}>{item.item_category4}</div>
                        </div>
                      )}
                      {item.item_category5 && (
                        <div className={styles.infoItem}>
                          <div className={styles.infoLabel}>CATEGORY5</div>
                          <div className={styles.infoValue}>{item.item_category5}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.infoColumn}>
                  {/* Order Details */}
                  <div className={styles.infoGroup}>
                    <div className={styles.groupTitle}>ORDER DETAILS</div>
                    {item.item_list_id && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>LIST ID</div>
                        <div className={styles.infoValue}>{item.item_list_id}</div>
                      </div>
                    )}
                    {item.item_list_name && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>LIST NAME</div>
                        <div className={styles.infoValue}>{item.item_list_name}</div>
                      </div>
                    )}
                    {item.affiliation && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>AFFILIATION</div>
                        <div className={styles.infoValue}>{item.affiliation}</div>
                      </div>
                    )}
                    {item.item_location_id && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>LOCATION ID</div>
                        <div className={styles.infoValue}>{item.item_location_id}</div>
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className={styles.infoGroup}>
                    <div className={styles.groupTitle}>STATUS</div>
                    {item.item_customized !== undefined && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>CUSTOMIZED</div>
                        <div className={`${styles.infoValue} ${item.item_customized ? styles.trueValue : styles.falseValue}`}>
                          {item.item_customized.toString()}
                        </div>
                      </div>
                    )}
                    {item.item_customization_amount !== undefined && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>CUSTOM AMT</div>
                        <div className={styles.infoValue}>${item.item_customization_amount.toFixed(2)}</div>
                      </div>
                    )}
                    {item.item_discounted !== undefined && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>DISCOUNTED</div>
                        <div className={`${styles.infoValue} ${item.item_discounted ? styles.trueValue : styles.falseValue}`}>
                          {item.item_discounted.toString()}
                        </div>
                      </div>
                    )}
                    {item.discount !== undefined && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>DISCOUNT</div>
                        <div className={styles.infoValue}>${item.discount.toFixed(2)}</div>
                      </div>
                    )}
                    {item.in_stock !== undefined && (
                      <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>IN STOCK</div>
                        <div className={`${styles.infoValue} ${item.in_stock ? styles.trueValue : styles.falseValue}`}>
                          {item.in_stock.toString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Attributes */}
                  {item.custom_attributes && item.custom_attributes.length > 0 && (
                    <div className={styles.infoGroup}>
                      <div className={styles.groupTitle}>CUSTOM ATTRIBUTES</div>
                      {item.custom_attributes.map((attr, attrIndex) => (
                        <div key={attrIndex} className={styles.infoItem}>
                          <div className={styles.infoLabel}>{attr.label}</div>
                          <div className={styles.infoValue}>{attr.value.toString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className={styles.tags}>
              {item.item_category && (
                <div className={styles.tag + ' ' + styles.tagCategory}>{item.item_category}</div>
              )}
              {item.item_category2 && (
                <div className={styles.tag + ' ' + styles.tagCategory}>{item.item_category2}</div>
              )}
              {item.item_brand && (
                <div className={styles.tag + ' ' + styles.tagBrand}>{item.item_brand}</div>
              )}
              {item.item_variant && (
                <div className={styles.tag + ' ' + styles.tagVariant}>{item.item_variant}</div>
              )}
              {item.coupon && (
                <div className={styles.tag + ' ' + styles.tagCoupon}>{item.coupon}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EcommerceCard; 