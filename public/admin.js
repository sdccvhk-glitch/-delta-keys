let auth="";
const loginPanel=document.getElementById("loginPanel"), dashboard=document.getElementById("dashboard");
document.getElementById("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const user=document.getElementById("user").value, pass=document.getElementById("pass").value;
  if(!user.trim() || !pass){
    document.getElementById("loginError").textContent="Enter both username and password.";
    return;
  }
  auth="Basic "+btoa(unescape(encodeURIComponent(user.trim()+":"+pass)));
  try{await loadAdmin();loginPanel.hidden=true;dashboard.hidden=false}catch(err){auth="";document.getElementById("loginError").textContent=err.message}
});
document.getElementById("logout").onclick=()=>{auth="";dashboard.hidden=true;loginPanel.hidden=false};

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),Authorization:auth,"Content-Type":"application/json"};
  const r=await fetch(url,opt);
  let out={};
  try{out=await r.json()}catch{}
  if(!r.ok) throw new Error(out.error||`Request failed (${r.status})`);
  return out;
}
async function loadAdmin(){
  const out=await api("/api/admin/data");
  const orders=out.orders;
  document.getElementById("stats").innerHTML=`
    <div class="stat"><strong>${orders.length}</strong><span>Total orders</span></div>
    <div class="stat"><strong>${orders.filter(o=>o.status==="pending").length}</strong><span>Waiting verification</span></div>
    <div class="stat"><strong>${orders.filter(o=>o.status==="approved").length}</strong><span>Approved</span></div>`;
  const box=document.getElementById("orders");
  box.innerHTML=orders.length?orders.map(o=>`
    <article class="order-card">
      <div class="order-top"><div><h3>${esc(o.productName)}</h3><div class="order-meta">Order: ${esc(o.id)}<br>Customer: ${esc(o.customerName)}<br>Contact: ${esc(o.customerContact)}<br>Payment ref: ${esc(o.paymentReference)}<br>Amount: ₹${Number(o.amount).toFixed(0)}</div></div><span class="status ${o.status}">${o.status}</span></div>
      <div class="admin-controls">
        <input id="key-${o.id}" value="${escAttr(o.key||"")}" placeholder="Customer key — edit here">
        <select id="status-${o.id}"><option ${o.status==="pending"?"selected":""}>pending</option><option ${o.status==="approved"?"selected":""}>approved</option><option ${o.status==="rejected"?"selected":""}>rejected</option></select>
        <button onclick="saveOrder('${o.id}')">Save / Approve</button>
      </div>
    </article>`).join(""):"<div class='glass form-card'><p class='muted'>No orders yet.</p></div>";
}
async function saveOrder(id){
  const key=document.getElementById("key-"+id).value;
  const status=document.getElementById("status-"+id).value;
  try{await api("/api/admin/orders/"+encodeURIComponent(id),{method:"PUT",body:JSON.stringify({key,status})});alert(status==="approved"?"Order approved — customer can now copy the key.":"Order updated.");loadAdmin()}catch(e){alert(e.message)}
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escAttr(s){return esc(s).replace(/`/g,"&#096;")}
