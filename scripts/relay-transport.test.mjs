import test from "node:test";
import assert from "node:assert/strict";
import {brokerFetch,relayFetch} from "../dist/relay-transport.js";
test("relay denies external destination before connecting",async()=>{
 await assert.rejects(relayFetch("https://outside.invalid/",{method:"HEAD",redirect:"manual"},"/nonexistent"),/DESTINATION_DENIED/);
});
test("configured relay failure never uses global fetch",async()=>{
 const saved=globalThis.fetch,prior=process.env.NH_BROKER_RELAY_SOCKET;
 let calls=0;globalThis.fetch=()=>{calls++;throw Error("direct fallback")};
 try{
  for(const path of ["","/nonexistent/broker.sock"]){
   process.env.NH_BROKER_RELAY_SOCKET=path;
   await assert.rejects(brokerFetch("https://api.nhplug.com:8443/",{method:"HEAD",redirect:"manual"}));
  }
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=saved;
  if(prior===undefined)delete process.env.NH_BROKER_RELAY_SOCKET;else process.env.NH_BROKER_RELAY_SOCKET=prior;
 }
});
