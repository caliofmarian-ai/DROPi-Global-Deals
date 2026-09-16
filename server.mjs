import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateLandedCost } from "./lib/landed-cost.mjs";
import { calculateBasketEconomics } from "./lib/basket.mjs";
import { enrichCatalog } from "./lib/catalog.mjs";
import { mergeMarketObservations } from "./lib/market-observations.mjs";
import { applyLocalMarketGuards } from "./lib/local-market-guards.mjs";
import { candidateFeed, dealFeed, summarizeCatalog } from "./lib/catalog-view.mjs";
import { analyticsConfig, forwardAnalyticsEvent } from "./lib/analytics.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".txt":"text/plain; charset=utf-8", ".xml":"application/xml; charset=utf-8", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".webp":"image/webp" };
const send=(res,status,body,type="application/json; charset=utf-8")=>{res.writeHead(status,{"content-type":type,"cache-control":"no-store"});res.end(body)};
async function readJson(relativePath){return JSON.parse(await readFile(join(root,relativePath),"utf8"))}
async function readOptionalJson(relativePath,fallback){try{return await readJson(relativePath)}catch(error){if(error?.code==="ENOENT")return fallback;throw error}}
async function readRequestJson(req,maxBytes=16_384){let raw="";for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>maxBytes)throw Object.assign(new Error("Request too large"),{statusCode:413})}return JSON.parse(raw||"{}")}
async function loadEvaluatedCatalog(){const[catalog,observations]=await Promise.all([readJson("data/products.json"),readOptionalJson("data/market-observations.json",{products:[],discoveredProducts:[]})]);return applyLocalMarketGuards(enrichCatalog(mergeMarketObservations(catalog,observations)))}

http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  if(url.pathname==="/health")return send(res,200,JSON.stringify({ok:true,service:"dropi-global-deals",catalogVersion:8,analytics:analyticsConfig().enabled}));
  if(url.pathname==="/api/products"&&req.method==="GET")return send(res,200,JSON.stringify(await loadEvaluatedCatalog()));
  if(url.pathname==="/api/deals"&&req.method==="GET")return send(res,200,JSON.stringify(dealFeed(await loadEvaluatedCatalog())));
  if(url.pathname==="/api/candidates"&&req.method==="GET")return send(res,200,JSON.stringify(candidateFeed(await loadEvaluatedCatalog())));
  if(url.pathname==="/api/status"&&req.method==="GET")return send(res,200,JSON.stringify(summarizeCatalog(await loadEvaluatedCatalog())));
  if(url.pathname==="/api/research-categories"&&req.method==="GET")return send(res,200,JSON.stringify(await readJson("data/research-categories.json")));
  if(url.pathname==="/api/fx"&&req.method==="GET")return send(res,200,JSON.stringify(await readJson("data/fx-rates.json")));
  if(url.pathname==="/api/analytics/config"&&req.method==="GET")return send(res,200,JSON.stringify(analyticsConfig()));
  if(url.pathname==="/api/analytics"&&req.method==="POST"){
    const input=await readRequestJson(req,8_192);
    const result=await forwardAnalyticsEvent(input);
    return send(res,result.accepted?202:result.reason==="Analytics is not configured"?202:422,JSON.stringify(result));
  }
  if((url.pathname==="/api/calculate"||url.pathname==="/api/basket")&&req.method==="POST"){const input=await readRequestJson(req);const result=url.pathname==="/api/basket"?calculateBasketEconomics(input,await readJson("data/fx-rates.json")):calculateLandedCost(input);return send(res,result.status==="complete"?200:422,JSON.stringify(result));}
  let path=url.pathname==="/"?"/index.html":url.pathname;path=normalize(path).replace(/^(\.\.[/\\])+/ ,"");if(!path.startsWith("/"))path=`/${path}`;const file=join(root,"public",path);if(!file.startsWith(join(root,"public")))return send(res,403,"Forbidden","text/plain");const body=await readFile(file);res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream"});res.end(body);
}catch(error){if(error?.statusCode===413)return send(res,413,"Request too large","text/plain; charset=utf-8");if(error?.code==="ENOENT")return send(res,404,"Not found","text/plain; charset=utf-8");console.error(error);return send(res,500,"Server error","text/plain; charset=utf-8")}}).listen(port,"0.0.0.0",()=>console.log(`DROPi Global listening on ${port}`));
