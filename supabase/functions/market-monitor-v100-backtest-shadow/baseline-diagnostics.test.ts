import { baselineRejectionReason, type BaselineDiagnosticFrames } from "./baseline-diagnostics.ts";
function makeFrames():BaselineDiagnosticFrames {
 const f={close:100.2,ema20:100,ema50:99,atr14:1,macdHistogram:.2};
 return {"4H":{...f},"1H":{...f},"15M":{...f},"5M":{...f}};
}
function input(frames=makeFrames(),scores={"4H":20,"1H":30,"15M":20,"5M":20}) {
 return {frames,scores,price:100.2,spread:.02};
}
Deno.test("baseline diagnostic identifies weak 1H directional confirmation",()=>{
 const f=makeFrames();f["1H"]={...f["1H"],ema20:98,ema50:99};
 if(baselineRejectionReason(input(f,{"4H":0,"1H":5,"15M":0,"5M":0}))!=="WEAK_1H_BIAS")throw new Error("Expected WEAK_1H_BIAS");
});
Deno.test("baseline diagnostic identifies strong 4H opposition",()=>{
 const f=makeFrames();
 if(baselineRejectionReason(input(f,{"4H":-31,"1H":30,"15M":20,"5M":20}))!=="4H_CONFLICT")throw new Error("Expected 4H_CONFLICT");
});
Deno.test("baseline diagnostic identifies pending 15M structure",()=>{
 const f=makeFrames();f["15M"]={...f["15M"],ema20:98,ema50:99};
 if(baselineRejectionReason(input(f,{"4H":0,"1H":30,"15M":-10,"5M":20}))!=="15M_SETUP_PENDING")throw new Error("Expected 15M_SETUP_PENDING");
});
Deno.test("baseline diagnostic identifies strong 5M entry conflict",()=>{
 const f=makeFrames();
 if(baselineRejectionReason(input(f,{"4H":0,"1H":30,"15M":20,"5M":-41}))!=="5M_ENTRY_CONFLICT")throw new Error("Expected 5M_ENTRY_CONFLICT");
});
Deno.test("baseline diagnostic identifies an overextended entry",()=>{
 const f=makeFrames();
 if(baselineRejectionReason({...input(f),price:102})!=="ENTRY_TOO_EXTENDED")throw new Error("Expected ENTRY_TOO_EXTENDED");
});
