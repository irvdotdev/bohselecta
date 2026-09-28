import { createInterface } from 'node:readline';
const send = m => process.stdout.write(JSON.stringify(m)+'\n');
const event = (method,params) => send({method,params:{threadId:'thread-1',...params}});
let model='gpt-6-luna', turns=0, pending, tokens=0;
const complete=(status='completed',text='OK')=>{
  event('item/agentMessage/delta',{delta:text});
  tokens+=10;
  event('thread/tokenUsage/updated',{tokenUsage:{total:{inputTokens:tokens,outputTokens:tokens/5,cachedInputTokens:0,cacheWriteInputTokens:0}}});
  event('turn/completed',{turn:{id:String(turns),status,error:status==='failed'?{message:'Test failure'}:null}});
};
createInterface({input:process.stdin}).on('line',line=>{
  const m=JSON.parse(line),p=m.params??{};
  if(m.id==='permission') { complete('completed',m.result?.decision==='accept'?'APPROVED':'DENIED');return; }
  const reply=result=>send({id:m.id,result});
  switch(m.method) {
    case 'initialize': reply({});break;
    case 'model/list': reply({data:['gpt-6-luna','gpt-6-sol','gpt-6-astra'].map(model=>({model,displayName:model,supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'},{reasoningEffort:'high'}],defaultReasoningEffort:'medium'})),nextCursor:null});break;
    case 'thread/start': model=p.model;reply({thread:{id:'thread-1'},model});break;
    case 'thread/resume': reply({thread:{id:'thread-1'},model});break;
    case 'thread/read': reply({thread:{id:'thread-1',model}});break;
    case 'turn/start': {
      turns++;model=p.model;
      const text=p.input[0].text;
      if(text==='crash') {process.exit(2);break;}
      if(text==='mismatch') model='unexpected-model';
      event('turn/started',{turn:{id:String(turns)}});reply({turn:{id:String(turns)}});
      if(text==='wait'||text==='mismatch') break;
      if(text==='approval') send({id:'permission',method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',command:'touch example.txt'}});
      else setTimeout(()=>complete(text==='fail'?'failed':'completed'),5);
      break;
    }
    case 'turn/interrupt': reply({});complete('interrupted','STOPPED');break;
  }
});
