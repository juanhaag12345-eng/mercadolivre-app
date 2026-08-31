import "dotenv/config";
import { db } from "../src/db";
import { products, sales } from "../src/db/schema";

async function main() {
  const [nutella] = await db
    .insert(products)
    .values({
      name: "Kit com 3 unidades de Nutella 650g",
      isKit: true,
      kitQuantity: 3,
      unitPrice: "35.90",
      saleFeeType: "percentual",
      saleFeeValue: "12",
      freeShipping: true,
      shippingCost: "22.00",
      packagingCost: "4.50",
      productCost: "24.00",
      active: true,
    })
    .returning();

  console.log("Produto criado:", nutella.id, nutella.name);

  await db.insert(sales).values({
    productId: nutella.id,
    productNameSnapshot: nutella.name,
    quantity: 1,
    saleDate: new Date().toISOString().slice(0, 10),
    orderStatus: "pendente",
    unitPriceSnapshot: nutella.unitPrice,
    kitQuantitySnapshot: nutella.kitQuantity,
    saleFeeTypeSnapshot: nutella.saleFeeType,
    saleFeeValueSnapshot: nutella.saleFeeValue,
    freeShippingSnapshot: nutella.freeShipping,
    shippingCostSnapshot: nutella.shippingCost,
    packagingCostSnapshot: nutella.packagingCost,
    productCostSnapshot: nutella.productCost,
  });

  console.log("Venda de teste registrada.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
