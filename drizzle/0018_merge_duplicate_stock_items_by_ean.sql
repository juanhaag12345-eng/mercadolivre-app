-- Custom SQL migration file, put your code below! --

-- Mescla itens de estoque duplicados que têm o MESMO EAN — isso podia
-- acontecer quando duas (ou mais) notas fiscais com o mesmo produto novo
-- eram aprovadas em seguida, antes da tela recarregar com o item recém
-- criado pela primeira (corrigido em actions/nfe.ts). Mantém o item mais
-- antigo (menor internal_code) de cada grupo, move pra ele as compras e
-- vendas que estavam ligadas aos duplicados, e só então remove os
-- duplicados — nenhum histórico de compra ou venda é perdido, só passa a
-- apontar pro item que sobrou. Não mexe em itens sem EAN nem em grupos com
-- um único item.
DO $$
DECLARE
  grupo RECORD;
  item_principal_id uuid;
  duplicado_id uuid;
BEGIN
  FOR grupo IN
    SELECT ean
    FROM stock_items
    WHERE ean IS NOT NULL AND ean <> ''
    GROUP BY ean
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO item_principal_id
    FROM stock_items
    WHERE ean = grupo.ean
    ORDER BY internal_code ASC
    LIMIT 1;

    FOR duplicado_id IN
      SELECT id FROM stock_items WHERE ean = grupo.ean AND id <> item_principal_id
    LOOP
      UPDATE stock_purchases SET stock_item_id = item_principal_id WHERE stock_item_id = duplicado_id;
      UPDATE sales SET stock_item_id = item_principal_id WHERE stock_item_id = duplicado_id;
      DELETE FROM stock_items WHERE id = duplicado_id;
    END LOOP;
  END LOOP;
END $$;
