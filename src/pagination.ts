import type { BrokerPage } from "./client.js";

export interface Collection {
  data: { Output_0: any; Output_1: any[]; rsp_cd: string; rsp_msg: string };
  audit: { complete: boolean; page_count: number; rows_collected: number; codes: string[]; cursor_present_on_continuation: boolean; duplicate_rows: number; failure_reason: string | null };
}

export async function collectBrokerPages(
  fetchPage: (cts?: string, ctsFlag?: string) => Promise<BrokerPage>,
  maxPages = 20
): Promise<Collection> {
  if(!Number.isInteger(maxPages) || maxPages<1 || maxPages>50) throw Error("허용된 최대 페이지 수를 초과했습니다");
  const rows:any[]=[];
  const codes:string[]=[];
  const seenCursors=new Set<string>();
  const rowKeys=new Set<string>();
  let duplicates=0;
  let next:string|undefined;
  let nextFlag:string|undefined;
  let firstSummary:any=null;
  let lastSummary:any=null;
  let complete=false;
  let failure_reason:string|null=null;
  let cursorFound=false;

  for(let i=0;i<maxPages;i++){
    const page=await fetchPage(next,nextFlag);
    const body=page.data??{};
    const code=String(body.rsp_cd??"");
    codes.push(code);
    const arr=Array.isArray(body.Output_1)?body.Output_1:[];
    for(const r of arr){
      const key=JSON.stringify(r);
      if(rowKeys.has(key))duplicates++;
      else rowKeys.add(key);
      rows.push(r);
    }
    if(i===0)firstSummary=body.Output_0??{};
    lastSummary=body.Output_0??{};
    if(code==="00166"||code==="11512"){
      complete=true;
      break;
    }
    if(code!=="00218"){
      failure_reason="unknown_broker_response";
      break;
    }
    const cursor=page.continuation?.cts;
    if(!cursor){
      failure_reason="continuation_cursor_missing";
      break;
    }
    cursorFound=true;
    if(seenCursors.has(cursor)){
      failure_reason="repeated_continuation_cursor";
      break;
    }
    seenCursors.add(cursor);
    next=cursor;
    nextFlag=page.continuation.flag??undefined;
    if(i===maxPages-1)failure_reason="max_pages_exceeded";
  }
  // Prevent silently trusting duplicate data or contradictory summaries.
  if(duplicates>0) {
    complete=false;
    failure_reason="duplicate_identical_rows_across_pages";
  }
  return {
    data:{Output_0:complete?lastSummary:firstSummary,Output_1:rows,
      rsp_cd:complete?"00166":(codes.at(-1)??"unknown"),
      rsp_msg:complete?"pagination_complete":"pagination_incomplete"},
    audit:{complete,page_count:codes.length,rows_collected:rows.length,codes,
      cursor_present_on_continuation:cursorFound,duplicate_rows:duplicates,
      failure_reason:failure_reason??(complete?null:"unknown_incomplete")},
  };
}
