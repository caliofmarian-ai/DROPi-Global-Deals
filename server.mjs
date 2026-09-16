import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateLandedCost } from "./lib/landed-cost.mjs";
import { calculateBasketEconomics } from "./lib/basket.mjs";
import { enrichCatalog } from "./lib/catalog.mjs";
import { mergeMarketObservations } from "./lib/market-observations.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml" };
const send=(res,status,body,type="application/json; charset=utf-8")=>{res.writeHead(status,{"content-type":type,"cache-control":"no-store"});res.end(body)};
async function readJson(relativePath){return JSON.parse(await readFile(join(root,relativePath),"utf8"))}
async function readOptionalJson(relativePath,fallback){try{return await readJson(relativePath)}catch(error){if(error?.code==="ENOENT")return fallback;throw error}}

http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
  if(url.pathname==="/health")return send(res,200,JSON.stringify({ok:true,service:"dropi-global-deals",catalogVersion:4}));
  if(url.pathname==="/api/products"&&req.method==="GET"){
    const [catalog,observations]=await Promise.all([readJson("data/products.json"),readOptionalJson("data/market-observations.json",{products:[]})]);
    return send(res,200,JSON.stringify(enrichCatalog(mergeMarketObservations(catalog,observations))));
  }
  if(url.pathname==="/api/research-categories"&&req.method==="GET")return send(res,200,JSON.stringify(await readJson("data/research-categories.json")));
  if(url.pathname==="/api/fx"&&req.method==="GET")return send(res,200,JSON.stringify(await readJson("data/fx-rates.json")));
  if((url.pathname==="/api/calculate"||url.pathname==="/api/basket")&&req.method==="POST"){let raw="";for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw||"{}");const result=url.pathname==="/api/basket"?calculateBasketEconomics(input,await readJson("data/fx-rates.json")):calculateLandedCost(input);return send(res,result.status==="complete"?200:422,JSON.stringify(result));}
  let path=url.pathname==="/"?"/index.html":url.pathname;path=normalize(path).replace(/^(\.\.[/\\])+/ ,"");if(!path.startsWith("/"))path=`/${path}`;const file=join(root,"public",path);if(!file.startsWith(join(root,"public")))return send(res,403,"Forbidden","text/plain");const body=await readFile(file);res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream"});res.end(body);
}catch(error){if(error?.code==="ENOENT")return send(res,404,"Not found","text/plain; charset=utf-8");console.error(error);return send(res,500,"Server error","text/plain; charset=utf-8")}}).listen(port,"0.0.0.0",()=>console.log(`DROPi Global listening on ${port}`));
