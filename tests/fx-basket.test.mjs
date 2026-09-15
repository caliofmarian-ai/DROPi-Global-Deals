import test from "node:test";
import assert from "node:assert/strict";
import { toEur } from "../lib/fx.mjs";
import { calculateBasketEconomics } from "../lib/basket.mjs";

const fx={date:"2026-09-15",rates:{RON:5.2627,PLN:4.34,GBP:0.8558}};

test("ECB quote converts foreign currency amount into EUR",()=>{const result=toEur(45,"RON",fx);assert.equal(result.status,"complete");assert.equal(result.amountEur,8.55);assert.equal(result.rate,5.2627)});
test("missing FX rate fails closed",()=>{assert.equal(toEur(100,"XYZ",fx).status,"incomplete")});
test("EU basket amortises fixed delivery and calculates break-even quantity",()=>{const result=calculateBasketEconomics({localIrelandUnitPrice:20.26,sourceUnitPrice:45,sourceCurrency:"RON",quantity:6,shipping:25,adminFee:0,dispatchInEu:true},fx);assert.equal(result.status,"complete");assert.equal(result.sourceUnitEur,8.55);assert.equal(result.sourceBasketPrice,51.3);assert.equal(result.landedCost,76.3);assert.equal(result.landedPerUnit,12.72);assert.equal(result.localBasketPrice,121.56);assert.equal(result.savings,45.26);assert.equal(result.breakEvenQuantity,3);assert.equal(result.maxShippingForQuantity,70.26)});
test("one-unit basket can lose even when multi-unit basket wins",()=>{const one=calculateBasketEconomics({localIrelandUnitPrice:20.26,sourceUnitPrice:45,sourceCurrency:"RON",quantity:1,shipping:25,dispatchInEu:true},fx);assert.equal(one.deal,false);assert.equal(one.savings,-13.29);const three=calculateBasketEconomics({localIrelandUnitPrice:20.26,sourceUnitPrice:45,sourceCurrency:"RON",quantity:3,shipping:25,dispatchInEu:true},fx);assert.equal(three.deal,true)});
