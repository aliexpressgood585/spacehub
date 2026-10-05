import { useEffect, useState } from 'react'
import { SUPA_KEY, SUPA_URL } from '../supa'

export function FlowShadow() {
  const [session,setSession]=useState<any>(null),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[now,setNow]=useState(Date.now())
  useEffect(()=>{
    let live=true
    const get=async(path:string)=>{const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{headers:{apikey:SUPA_KEY,Authorization:`Bearer ${SUPA_KEY}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
    const load=async()=>{try{
      const [s,r]=await Promise.all([get('flow_sessions?select=*&order=started_at.desc&limit=1'),get('flow_shadow?select=symbol,t0,status,side,net_bps&order=t0.desc&limit=500')])
      if(live){setSession(s[0]??null);setRows(r);setError('');setNow(Date.now())}
    }catch(e){if(live)setError(String(e))}}
    void load();const timer=setInterval(load,10000);return()=>{live=false;clearInterval(timer)}
  },[])
  const closed=rows.filter(r=>r.status==='closed'),expired=rows.filter(r=>r.status==='expired'),open=rows.filter(r=>r.status==='open')
  const avg=closed.length?closed.reduce((s,r)=>s+Number(r.net_bps),0)/closed.length:null
  const age=session?(now-Date.parse(session.finished_at))/1000:null
  return <section className="emptyPos" style={{textAlign:'right',padding:14,marginBottom:14}}>
    <strong>זרימת פקודות · חישוב בכל שנייה · צל בלבד</strong>
    <div>BTC · ETH · SOL · BNB · XRP · DOGE — לחץ ספר פקודות, עסקאות שבוצעו ותנועת מחיר. אין הוראות מסחר ואין הסתברות ניצחון מוכחת.</div>
    <div>חלונות איסוף של 55 שניות בכל דקה, עם חימום ופערי חיבור. תוצאה וירטואלית לאחר 30 שניות ועלויות.</div>
    <div>עדכון: {age==null?'ממתין לאיסוף':`לפני ${Math.max(0,Math.round(age))} שניות`} · חישובים בחלון: {session?.ticks??0} · בדיקות מטבע עם ספר עדכני: {session?.ready_ticks??0}/{(session?.ticks??0)*6}</div>
    <div>עד 500 האותות האחרונים: נסגרו {closed.length} · פתוחים {open.length} · נפסלו מחוסר נתונים {expired.length} · ממוצע נטו: {avg==null?'אין מדידה':`${avg.toFixed(2)} נקודות בסיס`}</div>
    <div>אין הפעלה אוטומטית למסחר. נדרשת בדיקת יתרון, עלויות ופערי כיסוי לפני החלטה.</div>
    {(error||session?.error||age==null||age>130)&&<div role="alert" style={{color:'#fbbf24'}}>מצב איסוף: {error||session?.error||(age==null?'טרם התקבל חלון':'נתוני האיסוף לא התעדכנו')}</div>}
  </section>
}
