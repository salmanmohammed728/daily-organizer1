const $=id=>document.getElementById(id);
const read=(key,fallback=[])=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let currentUser=null;
let cloudSaveTimer=null;
let realtimeChannel=null;
let applyingRemoteUpdate=false;
const SUPABASE_URL="https://yhagfshcrximejsjvghe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_RDohBYsIfuIOob9nghw1qA_ODKaTKZN";
const cloudClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}
});
const save=(key,value)=>{
  localStorage.setItem(key,JSON.stringify(value));
  if(!applyingRemoteUpdate) scheduleCloudSave();
};
function organizerData(){
  return {
    tasks,events,university,goals,
    notes:$("notesInput") ? $("notesInput").value : (localStorage.getItem("organizerNotes")||""),
    notesRelated:$("notesRelated") ? $("notesRelated").value : (localStorage.getItem("organizerNotesRelated")||"")
  };
}
function setCloudSaveStatus(message){
  const status=$("cloudSaveStatus");
  if(status)status.textContent=message;
}
function scheduleCloudSave(){
  setCloudSaveStatus(currentUser?"Changes saved on this device. Waiting to sync...":"Saved on this device. Sign in for cloud backup.");
  if(!currentUser)return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(async()=>{
    const saveTime=new Date();
    setCloudSaveStatus("Saving changes to your cloud account...");
    const {error}=await cloudClient.from("organizer_data").upsert(
      {user_id:currentUser.id,data:organizerData(),updated_at:saveTime.toISOString()},
      {onConflict:"user_id"}
    );
    if(error){
      $("authStatus").textContent="Cloud save issue: "+error.message;
      setCloudSaveStatus("Cloud save failed. Your latest changes remain saved on this device. Check your connection and try again.");
    }else{
      const stamp=saveTime.toLocaleString();
      localStorage.setItem("organizerLastCloudSave",saveTime.toISOString());
      $("lastCloudSave").textContent="Last cloud save: "+stamp;
      $("authStatus").textContent="Signed in. Your changes are syncing across devices.";
      setCloudSaveStatus("All changes saved to your cloud account.");
    }
  },500);
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
        localStorage.setItem("organizerNotesRelated",remoteData.notesRelated||"");
        if($("notesInput")) $("notesInput").value=remoteData.notes||"";
        if($("notesRelated")) $("notesRelated").value=remoteData.notesRelated||"";
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
  $("accountPanel").hidden=true;
  const previousSave=localStorage.getItem("organizerLastCloudSave");
  if(previousSave && $("lastCloudSave")) $("lastCloudSave").textContent="Last cloud save: "+new Date(previousSave).toLocaleString();
  setCloudSaveStatus("Loading your cloud-saved organizer...");
  $("authStatus").textContent="Loading your saved organizer...";
  $("signOutButton").hidden=false;
  $("googleSignInButton").hidden=true;
  $("appleSignInButton").hidden=true;
  const {data,error}=await cloudClient.from("organizer_data").select("data").eq("user_id",user.id).maybeSingle();
  if(error){
    $("authStatus").textContent="Could not load cloud data: "+error.message;
    setCloudSaveStatus("Could not load cloud data. Your local browser copy is still available.");
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
    localStorage.setItem("organizerNotesRelated",d.notesRelated||"");
    $("notesInput").value=d.notes||"";
    if($("notesRelated")) $("notesRelated").value=d.notesRelated||"";
  }else{
    const {error:saveError}=await cloudClient.from("organizer_data").upsert(
      {user_id:user.id,data:organizerData(),updated_at:new Date().toISOString()},
      {onConflict:"user_id"}
    );
    if(saveError){
      $("authStatus").textContent="Could not create your cloud backup: "+saveError.message;
      setCloudSaveStatus("Cloud backup could not be created. Your local browser copy is still available.");
      return;
    }
    const initialSave=new Date().toISOString();
    localStorage.setItem("organizerLastCloudSave",initialSave);
    if($("lastCloudSave")) $("lastCloudSave").textContent="Last cloud save: "+new Date(initialSave).toLocaleString();
  }
  renderTasks();renderUniversity();renderGoals();renderCalendar();
  startRealtimeSync(user);
  $("authStatus").textContent="Live sync connected. Changes appear automatically.";
  const savedAt=localStorage.getItem("organizerLastCloudSave");
  if(savedAt) $("lastCloudSave").textContent="Last cloud save: "+new Date(savedAt).toLocaleString();
  setCloudSaveStatus("Your organizer is connected to cloud sync.");
}
async function signInWithProvider(provider){
  $("authStatus").textContent="Connecting to "+(provider==="google"?"Google":"Apple")+"...";
  const {error}=await cloudClient.auth.signInWithOAuth({
    provider,
    options:{redirectTo:window.location.origin+window.location.pathname}
  });
  if(error) $("authStatus").textContent="Sign-in error: "+error.message;
}
["taskSearch","taskFilter","taskSort"].forEach(id=>$(id).addEventListener(id==="taskSearch"?"input":"change",renderTasks));["uniSearch","uniFilter"].forEach(id=>$(id).addEventListener(id==="uniSearch"?"input":"change",renderUniversity));$("googleSignInButton").onclick=()=>signInWithProvider("google");
$("appleSignInButton").onclick=()=>signInWithProvider("apple");
$("signOutButton").onclick=async()=>{
  const {error}=await cloudClient.auth.signOut();
  if(error){$("authStatus").textContent="Sign-out issue: "+error.message;return;}
  currentUser=null;
  $("accountPanel").hidden=false;
  if(realtimeChannel){cloudClient.removeChannel(realtimeChannel);realtimeChannel=null;}
  $("signOutButton").hidden=true;
  $("googleSignInButton").hidden=false;
  $("appleSignInButton").hidden=false;
  $("authStatus").textContent="Signed out. Your local copy remains on this device.";
};
let tasks=read("organizerTasks"),events=read("organizerEvents"),university=read("organizerUniversity"),goals=read("organizerGoals");
let shownMonth=new Date();shownMonth.setDate(1);let selectedDate=isoDate(new Date());
function isoDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return y+"-"+m+"-"+day}
function safe(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("currentDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
function updateStats(){
  const completed=tasks.filter(x=>x.completed).length;
  const remaining=tasks.filter(x=>!x.completed).length;
  const today=isoDate(new Date());
  const dueToday=tasks.filter(x=>!x.completed&&x.date===today).length;
  const overdue=tasks.filter(x=>!x.completed&&x.date&&x.date<today).length;
  $("totalTasks").textContent=tasks.length;
  $("completedTasks").textContent=completed;
  $("remainingTasks").textContent=remaining;
  $("dueTodayTasks").textContent=dueToday;
  $("overdueTasks").textContent=overdue;
  $("dashboardOverview").textContent=university.length+" university items · "+events.length+" personal events · "+goals.length+" goals.";
  renderUpcoming();
}
function refreshLinkSelectors(){const noteSelect=$("notesRelated");if(noteSelect){const chosen=noteSelect.value;const options=[...tasks.map(t=>({id:"task:"+t.id,label:"Task: "+t.title})),...university.map(u=>({id:"university:"+u.id,label:"University: "+u.title})),...goals.map(g=>({id:"goal:"+g.id,label:"Goal: "+g.title})),...events.map(ev=>({id:"event:"+ev.id,label:"Event: "+ev.title}))];noteSelect.innerHTML='<option value="">General notes</option>'+options.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.label)+'</option>').join("");noteSelect.value=chosen;}}
function renderTasks(){refreshLinkSelectors();const list=$("taskList");list.innerHTML="";const q=($("taskSearch")?.value||"").toLowerCase();const filter=$("taskFilter")?.value||"all";const sort=$("taskSort")?.value||"date";const today=isoDate(new Date());let visible=tasks.filter(t=>t.title.toLowerCase().includes(q));visible=visible.filter(t=>filter==="all"||(filter==="open"&&!t.completed)||(filter==="completed"&&t.completed)||(filter==="overdue"&&!t.completed&&t.date&&t.date<today)||(filter==="high"&&t.priority==="High"));visible.sort((a,b)=>sort==="newest"?Number(b.id)-Number(a.id):sort==="priority"?({High:0,Medium:1,Low:2}[a.priority]-({High:0,Medium:1,Low:2}[b.priority])):(a.date||"9999").localeCompare(b.date||"9999"));visible.forEach(t=>{const li=document.createElement("li");if(t.completed)li.classList.add("done");li.innerHTML='<input type="checkbox" aria-label="Complete task" '+(t.completed?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(t.title)+'</span><small>'+safe(t.date||"No date")+' · '+safe(t.category||"Personal")+(t.repeat&&t.repeat!=="none"?" · Repeats "+safe(t.repeat):"")+(t.description?" · "+safe(t.description):"")+'</small></div><span class="priority '+safe(t.priority)+'">'+safe(t.priority)+'</span><button class="secondary edit-task-btn" type="button">Edit</button><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{t.completed=e.target.checked;if(t.sourceUniversityId){const linked=university.find(u=>String(u.id)===String(t.sourceUniversityId));if(linked)linked.done=t.completed;save("organizerUniversity",university);renderUniversity()}save("organizerTasks",tasks);renderTasks();renderGoals();renderCalendar()};li.querySelector(".edit-task-btn").onclick=()=>{const title=prompt("Task title:",t.title);if(title===null)return;if(!title.trim()){alert("Task title cannot be empty.");return;}const description=prompt("Description:",t.description||"");if(description===null)return;const date=prompt("Due date (YYYY-MM-DD), or leave blank:",t.date||"");if(date===null)return;t.title=title.trim();t.description=description.trim();t.date=date.trim();save("organizerTasks",tasks);renderTasks();renderCalendar()};li.querySelector(".delete-btn").onclick=()=>{if(!confirm("Delete this task?"))return;tasks=tasks.filter(x=>x.id!==t.id);save("organizerTasks",tasks);renderTasks();renderCalendar()};list.append(li)});updateStats()}
$("taskForm").onsubmit=e=>{e.preventDefault();tasks.push({id:Date.now(),title:$("taskInput").value.trim(),description:$("taskDescription").value.trim(),category:$("taskCategory").value,repeat:$("taskRepeat").value,priority:$("priority").value,date:$("taskDate").value,completed:false});save("organizerTasks",tasks);e.target.reset();$("priority").value="Medium";renderTasks();renderGoals();renderCalendar()};
function renderUniversity(){const list=$("uniList");list.innerHTML="";const q=($("uniSearch")?.value||"").toLowerCase();const filter=$("uniFilter")?.value||"all";university.filter(u=>(u.title+" "+(u.course||"")).toLowerCase().includes(q)).filter(u=>filter==="all"||(filter==="open"&&!u.done)||(filter==="done"&&u.done)||u.type===filter).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(u=>{const li=document.createElement("li");li.innerHTML='<input type="checkbox" aria-label="Mark complete" '+(u.done?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(u.title)+'</span><small>'+safe(u.course||"No course")+" · "+safe(u.type)+" · "+safe(u.date)+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{u.done=e.target.checked;tasks.forEach(t=>{if(String(t.sourceUniversityId)===String(u.id))t.completed=u.done});save("organizerUniversity",university);save("organizerTasks",tasks);renderUniversity();renderTasks();renderCalendar()};li.querySelector("button").onclick=()=>{university=university.filter(x=>x.id!==u.id);tasks=tasks.filter(t=>String(t.sourceUniversityId)!==String(u.id));save("organizerUniversity",university);save("organizerTasks",tasks);renderUniversity();renderTasks();renderCalendar()};list.append(li)})}
$("uniForm").onsubmit=e=>{e.preventDefault();const item={id:Date.now(),title:$("uniTitle").value.trim(),course:$("uniCourse").value.trim(),type:$("uniType").value,date:$("uniDate").value,done:false};university.push(item);if(["Assignment","Exam"].includes(item.type)){tasks.push({id:Date.now()+1,title:item.title+(item.course?" ("+item.course+")":""),priority:"Medium",date:item.date,completed:false,sourceUniversityId:item.id});save("organizerTasks",tasks);renderTasks()}save("organizerUniversity",university);e.target.reset();renderUniversity();renderCalendar()};
function renderGoals(){const list=$("goalList");list.innerHTML="";goals.forEach(g=>{const li=document.createElement("li");if(g.done)li.classList.add("done");li.innerHTML='<input type="checkbox" aria-label="Complete goal" '+(g.done?"checked":"")+'><div class="item-main"><span class="item-title">'+safe(g.title)+'</span><small>Target: '+safe(g.date||"No date set")+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("input").onchange=e=>{g.done=e.target.checked;save("organizerGoals",goals);renderGoals()};li.querySelector("button").onclick=()=>{goals=goals.filter(x=>x.id!==g.id);save("organizerGoals",goals);renderGoals();renderTasks()};list.append(li)})}
$("goalForm").onsubmit=e=>{e.preventDefault();goals.push({id:Date.now(),title:$("goalTitle").value.trim(),date:$("goalDate").value,done:false});save("organizerGoals",goals);e.target.reset();renderGoals();renderTasks()};
function itemsOn(date){return [...tasks.filter(x=>x.date===date&&!x.completed).map(x=>x.title),...university.filter(x=>x.date===date&&!x.done).map(x=>x.title),...events.filter(x=>x.date===date).map(x=>x.title),...goals.filter(x=>x.date===date&&!x.done).map(x=>"Goal: "+x.title)]}
function renderCalendar(){const grid=$("calendarGrid");grid.innerHTML="";["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>{const el=document.createElement("div");el.className="calendar-day-name";el.textContent=d;grid.append(el)});const year=shownMonth.getFullYear(),month=shownMonth.getMonth(),first=new Date(year,month,1),start=first.getDay(),days=new Date(year,month+1,0).getDate(),total=Math.ceil((start+days)/7)*7;$("monthLabel").textContent=shownMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});for(let i=0;i<total;i++){const date=new Date(year,month,1-start+i),key=isoDate(date),el=document.createElement("button");el.type="button";el.className="calendar-day"+(date.getMonth()!==month?" muted":"")+(key===selectedDate?" selected":"")+(key===isoDate(new Date())?" today":"");const entries=itemsOn(key);el.innerHTML='<span class="day-number">'+date.getDate()+'</span>'+entries.slice(0,2).map(x=>'<span class="day-dot">• '+safe(x)+'</span>').join("");el.onclick=()=>{selectedDate=key;$("eventDate").value=key;$("taskDate").value=key;$("uniDate").value=key;renderCalendar();renderEventsForSelected()};grid.append(el)}renderEventsForSelected()}
function renderEventsForSelected(){const list=$("eventList");list.innerHTML="";const selected=events.filter(x=>x.date===selectedDate);const linkedTasks=tasks.filter(x=>x.date===selectedDate);const uniItems=university.filter(x=>x.date===selectedDate);const goalItems=goals.filter(x=>x.date===selectedDate);[...linkedTasks.map(x=>({title:"Task: "+x.title,done:x.completed})),...uniItems.map(x=>({title:x.type+": "+x.title,done:x.done})),...goalItems.map(x=>({title:"Goal: "+x.title,done:x.done}))].forEach(item=>{const li=document.createElement("li");li.innerHTML='<div class="item-main">'+safe(item.title)+'<small>'+(item.done?"Completed":"Upcoming")+"</small></div>";if(item.done)li.classList.add("done");list.append(li)});if(!selected.length&&!linkedTasks.length&&!uniItems.length&&!goalItems.length){const li=document.createElement("li");li.textContent="No items on "+selectedDate;list.append(li)}selected.forEach(ev=>{const li=document.createElement("li");li.innerHTML='<div class="item-main">'+safe(ev.title)+'<small>'+safe(ev.date)+'</small></div><button class="delete-btn" type="button">Delete</button>';li.querySelector("button").onclick=()=>{events=events.filter(x=>x.id!==ev.id);save("organizerEvents",events);renderCalendar()};list.append(li)})}
$("eventForm").onsubmit=e=>{e.preventDefault();events.push({id:Date.now(),title:$("eventTitle").value.trim(),date:$("eventDate").value});save("organizerEvents",events);$("eventTitle").value="";renderCalendar()};
$("prevMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()-1);renderCalendar()};$("nextMonth").onclick=()=>{shownMonth.setMonth(shownMonth.getMonth()+1);renderCalendar()};$("todayButton").onclick=()=>{shownMonth=new Date();shownMonth.setDate(1);selectedDate=isoDate(new Date());$("eventDate").value=selectedDate;renderCalendar()};
function updateNotesCount(){const value=$("notesInput").value;const words=value.trim()?value.trim().split(/\s+/).length:0;$("notesCount").textContent=words+" words · "+value.length+" characters";} $("notesInput").value=localStorage.getItem("organizerNotes")||"";$("notesRelated").value=localStorage.getItem("organizerNotesRelated")||"";updateNotesCount();$("notesInput").addEventListener("input",updateNotesCount);$("notesSearch").addEventListener("input",()=>{const term=$("notesSearch").value;const index=$("notesInput").value.toLowerCase().indexOf(term.toLowerCase());$("notesStatus").textContent=!term?"Search cleared.":index<0?"No match found.":"Found a match at character "+(index+1)+".";});$("clearNotesButton").onclick=()=>{if(confirm("Clear all notes?")){$("notesInput").value="";localStorage.setItem("organizerNotes","");updateNotesCount();scheduleCloudSave();$("notesStatus").textContent="Notes cleared.";}};$("notesRelated").addEventListener("change",()=>{localStorage.setItem("organizerNotesRelated",$("notesRelated").value);scheduleCloudSave()});let noteTimer;$("notesInput").addEventListener("input",()=>{localStorage.setItem("organizerNotes",$("notesInput").value);$("notesStatus").textContent="Saved on this device.";scheduleCloudSave()});
function renderUpcoming(){const list=$("upcomingList");if(!list)return;list.innerHTML="";const today=isoDate(new Date());const items=[...tasks.filter(x=>!x.completed&&x.date).map(x=>({date:x.date,title:"Task: "+x.title})),...university.filter(x=>!x.done&&x.date).map(x=>({date:x.date,title:x.type+": "+x.title})),...events.filter(x=>x.date).map(x=>({date:x.date,title:"Event: "+x.title})),...goals.filter(x=>!x.done&&x.date).map(x=>({date:x.date,title:"Goal: "+x.title}))].filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6);if(!items.length){const li=document.createElement("li");li.textContent="Nothing upcoming. Add a task, event, university item or goal.";list.append(li);return;}items.forEach(item=>{const li=document.createElement("li");li.innerHTML='<div class="item-main">'+safe(item.title)+'<small>'+safe(item.date)+(item.date===today?" · Today":"")+"</small></div>";list.append(li)});} $("eventDate").value=selectedDate;$("taskDate").value=selectedDate;renderTasks();renderUniversity();renderGoals();renderCalendar();

(async()=>{
  const {data}=await cloudClient.auth.getSession();
  if(data.session) await loadCloudData(data.session.user);
})();


// Show one organizer page at a time.
function showView(viewId){
  const allowed=["dashboard","tasks","calendar","university","goals","notes"];
  const target=allowed.includes(viewId)?viewId:"dashboard";
  document.querySelectorAll(".view-section").forEach(section=>{
    section.classList.toggle("active",section.id===target);
  });
  document.querySelectorAll("[data-view]").forEach(link=>{
    const active=link.dataset.view===target;
    link.classList.toggle("active",active);
    if(active) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  });
}
document.querySelectorAll("[data-view]").forEach(link=>{
  link.addEventListener("click",event=>{
    event.preventDefault();
    const view=link.dataset.view;
    showView(view);
    history.replaceState(null,"","#"+view);
  });
});
showView(location.hash.slice(1)||"dashboard");
$("accountPanel").hidden=false;

// Download a portable backup file.
$("downloadBackupButton").onclick=()=>{
  const backup={app:"Daily Organizer",version:1,exportedAt:new Date().toISOString(),data:organizerData()};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="daily-organizer-backup-"+isoDate(new Date())+".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $("backupStatus").textContent="Backup downloaded. Keep this file somewhere safe.";
};

// Restore a backup and replace the current organizer data after confirmation.
$("restoreBackupInput").addEventListener("change",async event=>{
  const file=event.target.files&&event.target.files[0];
  if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    const d=parsed.data||parsed;
    if(!d||!Array.isArray(d.tasks)||!Array.isArray(d.events)||
       !Array.isArray(d.university)||!Array.isArray(d.goals)||typeof d.notes!=="string"){
      throw new Error("This file is not a valid Daily Organizer backup.");
    }
    if(!confirm("Restore this backup? It will replace the organizer data currently on this account.")) return;
    applyingRemoteUpdate=true;
    tasks=d.tasks;events=d.events;university=d.university;goals=d.goals;
    localStorage.setItem("organizerTasks",JSON.stringify(tasks));
    localStorage.setItem("organizerEvents",JSON.stringify(events));
    localStorage.setItem("organizerUniversity",JSON.stringify(university));
    localStorage.setItem("organizerGoals",JSON.stringify(goals));
    localStorage.setItem("organizerNotes",d.notes);
    localStorage.setItem("organizerNotesRelated",d.notesRelated||"");
    $("notesInput").value=d.notes;
    $("notesRelated").value=d.notesRelated||"";
    applyingRemoteUpdate=false;
    renderTasks();renderUniversity();renderGoals();renderCalendar();
    if(currentUser){
      const {error}=await cloudClient.from("organizer_data").upsert(
        {user_id:currentUser.id,data:organizerData(),updated_at:new Date().toISOString()},
        {onConflict:"user_id"}
      );
      if(error) throw error;
      $("backupStatus").textContent="Backup restored and saved to your cloud account.";
    }else{
      $("backupStatus").textContent="Backup restored on this device. Sign in to sync it to the cloud.";
    }
  }catch(error){
    applyingRemoteUpdate=false;
    $("backupStatus").textContent="Restore failed: "+error.message;
  }finally{
    event.target.value="";
  }
});


// Remember the user's preferred appearance.
const themeToggle=$("themeToggle");
const savedTheme=localStorage.getItem("organizerTheme")||"light";
if(savedTheme==="dark")document.body.classList.add("dark-theme");
function updateThemeButton(){
  const dark=document.body.classList.contains("dark-theme");
  themeToggle.textContent=dark?"☀️ Light mode":"🌙 Dark mode";
  themeToggle.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
}
updateThemeButton();
themeToggle.addEventListener("click",()=>{
  document.body.classList.toggle("dark-theme");
  localStorage.setItem("organizerTheme",document.body.classList.contains("dark-theme")?"dark":"light");
  updateThemeButton();
});
