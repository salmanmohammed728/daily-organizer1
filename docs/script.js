const $=id=>document.getElementById(id);
const read=(key,fallback=[])=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let currentUser=null;
let cloudSaveTimer=null;
let realtimeChannel=null;
let applyingRemoteUpdate=false;
const SUPABASE_URL="https://yhagfshcrximejsjvghe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_RDohBYsIfuIOob9nghw1qA_ODKaTKZN";
const cloudClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const save=(key,value)=>{
  localStorage.setItem(key,JSON.stringify(value));
  if(!applyingRemoteUpdate) scheduleCloudSave();
};
function organizerData(){
  return {
    tasks,events,university,goals,
    notes:$("notesInput") ? $("notesInput").value : (localStorage.getItem("organizerNotes")||"")
  };
}
function scheduleCloudSave(){
  if(!currentUser)return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(async()=>{
    const {error}=await cloudClient.from("organizer_data").upsert(
      {user_id:currentUser.id,data:organizerData(),updated_at:new Date().toISOString()},
      {onConflict:"user_id"}
    );
    if(error){$("authStatus").textContent="Cloud save issue: "+error.message;}
    else $("authStatus").textContent="Signed in. Your changes are syncing across devices.";
  },150);
}
function startRealtimeSync(user){
  if(realtimeChannel) cloudClient.removeChannel(realtimeChannel);
  realtimeChannel=cloudClient.channel("organizer-live-"+user.id)
    .on("postgres_changes",{
      event:"*",schema:"public",table:"organizer_data",filter:"user_id=eq."+user.id
    },payload=>{
      const remoteData=payload.new && payload.new.data;
      if(!remoteData || payload.eventType==="DELETE") return;
      applyingRemoteUpdate=true;
      try{
        tasks=Array.isArray(remoteData.tasks)?remoteData.tasks:[];
        events=Array.isArray(remoteData.events)?remoteData.events:[];
        university=Array.isArray(remoteData.university)?remoteData.university:[];
        goals=Array.isArray(remoteData.goals)?remoteData.goals:[];
        localStorage.setItem("organizerTasks",JSON.stringify(tasks));
        localStorage.setItem("organizerEvents",JSON.stringify(events));
        localStorage.setItem("organizerUniversity",JSON.stringify(university));
        localStorage.setItem("organizerGoals",JSON.stringify(goals));
        localStorage.setItem("organizerNotes",remoteData.notes||"");
        if($("notesInput")) $("notesInput").value=remoteData.notes||"";
        renderTasks();renderUniversity();renderGoals();renderCalendar();
        $("authStatus").textContent="Live sync connected. Latest changes received.";
      }finally{
        applyingRemoteUpdate=false;
      }
    })
    .subscribe(status=>{
      if(status==="SUBSCRIBED") $("authStatus").textContent="Live sync connected. Changes appear automatically.";
      else if(status==="CHANNEL_ERROR") $("authStatus").textContent="Live sync connection issue. Check Supabase Realtime settings.";
      else if(status==="TIMED_OUT") $("authStatus").textContent="Live sync timed out. Reconnecting...";
      else if(status==="CLOSED") $("authStatus").textContent="Live sync disconnected. Reopen the organizer to reconnect.";
    });
}
async function loadCloudData(user){
  currentUser=user;
  $("authStatus").textContent="Loading your saved organizer...";
  $("signOutButton").hidden=false;
  const {data,error}=await cloudClient.from("organizer_data").select("data").eq("user_id",user.id).maybeSingle();
  if(error){
    $("authStatus").textContent="Could not load cloud data: "+error.message;
    return;
  }
  if(data && data.data){
    const d=data.data;
    tasks=Array.isArray(d.tasks)?d.tasks:[];
    events=Array.isArray(d.events)?d.events:[];
    university=Array.isArray(d.university)?d.university:[];
    goals=Array.isArray(d.goals)?d.goals:[];
    localStorage.setItem("organizerTasks",JSON.stringify(tasks));
    localStorage.setItem("organizerEvents",JSON.stringify(events));
    localStorage.setItem("organizerUniversity",JSON.stringify(university));
    localStorage.setItem("organizerGoals",JSON.stringify(goals));
    localStorage.setItem("organizerNotes",d.notes||"");
    $("notesInput").value=d.notes||"";
  }else{
    const {error:saveError}=await cloudClient.from("organizer_data").upsert(
      {user_id:user.id,data:organizerData(),updated_at:new Date().toISOString()},
      {onConflict:"user_id"}
    );
    if(saveError){
      $("authStatus").textContent="Could not create your cloud backup: "+saveError.message;
      return;
    }
  }
  renderTasks();renderUniversity();renderGoals();renderCalendar();
  startRealtimeSync(user);
  $("authStatus").textContent="Live sync connected. Changes appear automatically.";
}
async function signIn(email,password){
  const {data,error}=await cloudClient.auth.signInWithPassword({email,password});
  if(error){$("authStatus").textContent=error.message;return;}
  await loadCloudData(data.user);
}
$("authForm").onsubmit=async e=>{
  e.preventDefault();
  $("authStatus").textContent="Signing in...";
  await signIn($("authEmail").value.trim(),$("authPassword").value);
};
$("signUpButton").onclick=async()=>{
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  if(!email||!password){$("authStatus").textContent="Enter your email and password first.";return;}
  $("authStatus").textContent="Creating your account...";
  const {data,error}=await cloudClient.auth.signUp({email,password});
  if(error){$("authStatus").textContent=error.message;return;}
  if(data.session) await loadCloudData(data.user);
  else $("authStatus").textContent="Account created. Check your email for a confirmation link, then return here and sign in.";
};
$("signOutButton").onclick=async()=>{
  await cloudClient.auth.signOut();
  currentUser=null;
  if(realtimeChannel){cloudClient.removeChannel(realtimeChannel);realtimeChannel=null;}
  $("signOutButton").hidden=true;
  $("authStatus").textContent="Signed out. This device still has its local copy.";
};
let tasks=read("organizerTasks"),events=read("organizerEvents"),university=read("organizerUniversity"),goals=read("organizerGoals");
let shownMonth=new Date();shownMonth.setDate(1);let selectedDate=isoDate(new Date());
function isoDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day}
function safe(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("currentDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
function updateStats(){$("totalTasks").textContent=tasks.length;$("completedTasks").textContent=tasks.filter(x=>x.completed).length;$("remainingTasks").textContent=tasks.filter(x=>!x.completed).length}
function renderTasks(){const list=$("taskList");list.innerHTML="";tasks.forEach(t=>{const li=document.createElement("li");if(t.completed)li.classList.add("done");li.innerHTML='<input type="checkbox" aria-label="Complete task" '+(t.completed?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(t.title)+'</span><small>'+safe(t.date||"No date")+'</small></div><span class="priority '+safe(t.priority)+'">'+safe(t.priority)+'</span><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{t.completed=e.target.checked;save("organizerTasks",tasks);renderTasks();renderCalendar()};li.querySelector("button").onclick=()=>{tasks=tasks.filter(x=>x.id!==t.id);save("organizerTasks",tasks);renderTasks();renderCalendar()};list.append(li)});updateStats()}
$("taskForm").onsubmit=e=>{e.preventDefault();tasks.push({id:Date.now(),title:$("taskInput").value.trim(),priority:$("priority").value,date:$("taskDate").value,completed:false});save("organizerTasks",tasks);e.target.reset();$("priority").value="Medium";renderTasks();renderCalendar()};
function renderUniversity(){const list=$("uniList");list.innerHTML="";university.forEach(u=>{const li=document.createElement("li");li.innerHTML='<input type="checkbox" aria-label="Mark complete" '+(u.done?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(u.title)+'</span><small>'+safe(u.course||"No course")+" · "+safe(u.type)+" · "+safe(u.date)+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{u.done=e.target.checked;save("organizerUniversity",university);renderUniversity();renderCalendar()};li.querySelector("button").onclick=()=>{university=university.filter(x=>x.id!==u.id);save("organizerUniversity",university);renderUniversity();renderCalendar()};list.append(li)})}
$("uniForm").onsubmit=e=>{e.preventDefault();university.push({id:Date.now(),title:$("uniTitle").value.trim(),course:$("uniCourse").value.trim(),type:$("uniType").value,date:$("uniDate").value,done:false});save("organizerUniversity",university);e.target.reset();renderUniversity();renderCalendar()};
function renderGoals(){const list=$("goalList");list.innerHTML="";goals.forEach(g=>{const li=document.createElement("li");if(g.done)li.classList.add("done");li.innerHTML='<input type="checkbox" aria-label="Complete goal" '+(g.done?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(g.title)+'</span><small>Target: '+safe(g.date||"No date set")+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{g.done=e.target.checked;save("organizerGoals",goals);renderGoals()};li.querySelector("button").onclick=()=>{goals=goals.filter(x=>x.id!==g.id);save("organizerGoals",goals);renderGoals()};list.append(li)})}
$("goalForm").onsubmit=e=>{e.preventDefault();goals.push({id:Date.now(),title:$("goalTitle").value.trim(),date:$("goalDate").value,done:false});save("organizerGoals",goals);e.target.reset();renderGoals()};
function itemsOn(date){return [...tasks.filter(x=>x.date===date&&!x.completed).map(x=>x.title),...university.filter(x=>x.date===date&&!x.done).map(x=>x.title),...events.filter(x=>x.date===date).map(x=>x.title)]}
function renderCalendar(){const grid=$("calendarGrid");grid.innerHTML="";["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>{const el=document.createElement("div");el.className="calendar-day-name";el.textContent=d;grid.append(el)});const year=shownMonth.getFullYear(),month=shownMonth.getMonth(),first=new Date(year,month,1),start=first.getDay(),days=new Date(year,month+1,0).getDate(),total=Math.ceil((start+days)/7)*7;$("monthLabel").textContent=shownMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});for(let i=0;i<total;i++){const date=new Date(year,month,1-start+i),key=isoDate(date),el=document.createElement("button");el.type="button";el.className="calendar-day"+(date.getMonth()!==month?" muted":"")+(key===selectedDate?" selected":"")+(key===isoDate(new Date())?" today":"");const entries=itemsOn(key);el.innerHTML='<span class="day-number">'+date.getDate()+'</span>'+entries.slice(0,2).map(x=>'<span class="day-dot">• '+safe(x)+'</span>').join("");el.onclick=()=>{selectedDate=key;$("eventDate").value=key;$("taskDate").value=key;$("uniDate").value=key;renderCalendar();renderEventsForSelected()};grid.append(el)}renderEventsForSelected()}
function renderEventsForSelected(){const list=$("eventList");list.innerHTML="";const selected=events.filter(x=>x.date===selectedDate);if(!selected.length){const li=document.createElement("li");li.textContent="No personal events on "+selectedDate;list.append(li)}selected.forEach(ev=>{const li=document.createElement("li");li.innerHTML='<div class="item-main">'+safe(ev.title)+'<small>'+safe(ev.date)+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("button").onclick=()=>{events=events.filter(x=>x.id!==ev.id);save("organizerEvents",events);renderCalendar()};list.append(li)})}
$("eventForm").onsubmit=e=>{e.preventDefault();events.push({id:Date.now(),title:$("eventTitle").value.trim(),date:$("eventDate").value});save("organizerEvents",events);$("eventTitle").value="";renderCalendar()};
$("prevMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()-1);renderCalendar()};$("nextMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()+1);renderCalendar()};$("todayButton").onclick=()=>{shownMonth=new Date();shownMonth.setDate(1);selectedDate=isoDate(new Date());$("eventDate").value=selectedDate;renderCalendar()};
$("notesInput").value=localStorage.getItem("organizerNotes")||"";let noteTimer;$("notesInput").addEventListener("input",()=>{localStorage.setItem("organizerNotes",$("notesInput").value);$("notesStatus").textContent="Saved on this device.";scheduleCloudSave()});
$("eventDate").value=selectedDate;$("taskDate").value=selectedDate;renderTasks();renderUniversity();renderGoals();renderCalendar();

(async()=>{
  const {data}=await cloudClient.auth.getSession();
  if(data.session) await loadCloudData(data.session.user);
})();
