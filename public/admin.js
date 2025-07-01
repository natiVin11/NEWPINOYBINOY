
const STATUS_OPTIONS = [
    "ללא מענה",
    "ענה ונקבע פגישה",
    "סרבן",
    "חתם"
];

function deleteProject(project) {
    if (!confirm(`Are you sure you want to delete the project "${project}"? This action cannot be undone.`)) {
        return;
    }
    fetch('/delete-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Project deleted successfully!');
            loadAssignments(); // Refresh the list of assignments
            loadAllProjects(); // Refresh the list of project stats
        } else {
            alert(`Error deleting project: ${data.message}`);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while deleting the project.');
    });
}

function loadAssignments() {
    fetch('/all-project-names')
        .then(res => res.json())
        .then(projects => {
            const container = document.getElementById('assignments');
            container.innerHTML = '<h4>שייכות פרויקטים למשתמשים</h4>';
            projects.forEach(p => {
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `<b>${p}</b> <button onclick="viewBuildings('${p}')">צפה בבניינים</button>`;
                container.appendChild(div);
            });
        });
}

function viewBuildings(project) {
    fetch(`/buildings-users/${project}`)
        .then(res => res.json())
        .then(buildings => {
            const stats = document.getElementById('assignments');
            stats.innerHTML = `<h4>בניינים בפרויקט ${project}</h4>`;
            buildings.forEach(b => {
                const div = document.createElement('div');
                div.className = 'card';
                const selectId = `select-${b.address}`;
                div.innerHTML = `<b>כתובת:</b> ${b.address}<br>
          <select id='${selectId}'>
            <option value=''>בחר משתמש</option>
          </select>
          <button onclick="assignBuilding('${project}', '${b.address}')">שייך לבניין</button>`;
                stats.appendChild(div);
            });

            fetch('/users')
                .then(r => r.json())
                .then(users => {
                    users.filter(u => u.role !== 'admin').forEach(u => {
                        buildings.forEach(b => {
                            const sel = document.getElementById(`select-${b.address}`);
                            const opt = document.createElement('option');
                            opt.value = u.id;
                            opt.textContent = u.username;
                            sel.appendChild(opt);
                        });
                    });
                });
        });
}

function assignBuilding(project, address) {
    const userId = document.getElementById(`select-${address}`).value;
    if (!userId) return alert('בחר משתמש');
    fetch('/assign-project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, project, address })
    }).then(() => alert('שויך בהצלחה'));
}

function loadAllProjects() {
    fetch('/all-projects')
        .then(res => res.json())
        .then(projects => {
            const container = document.getElementById('projectStats');
            container.innerHTML = '<h4>סטטוסים לפי פרויקט</h4>';
            projects.forEach(p => {
                const div = document.createElement('div');
                div.innerHTML = `<b>${p.project}</b>: סה\"כ דיירים ${p.total} <button onclick="viewProjectStats('${p.project}')">צפה בפרויקט</button>`;
                container.appendChild(div);
            });
        });
}

function viewProjectStats(project) {
    fetch(`/project/${project}`)
        .then(res => res.json())
        .then(data => {
            const stats = document.getElementById('stats') || document.createElement('div');
            stats.id = 'stats';
            stats.innerHTML = `<h4>סטטוסים עבור ${project}</h4>` +
                data.map(s => `<div><strong>${s.status}:</strong> ${s.count} <button onclick=\"loadStatus('${project}','${s.status}')\">צפה</button></div>`).join('');
            document.getElementById('projectStats').appendChild(stats);
        });
}

function loadStatus(project, status) {
    fetch(`/residents/${project}/${status}`)
        .then(res => res.json())
        .then(data => {
            alert(data.map(d => `${d.name} (${d.address} דירה ${d.apartment})\nסטטוס: ${d.status}\nהערה: ${d.note || 'אין'}\nעודכן בתאריך: ${d.updated_at || '---'}`).join('\n\n'));
        });
}

fetch('/users').then(res => res.json()).then(users => {
    const list = document.getElementById('userList');
    list.innerHTML = users.map(u => `
    <div class='card'>
      <b>${u.username}</b> (${u.role})
      <input type='password' id='pass-${u.id}' placeholder='סיסמה חדשה'>
      <button onclick='updateUser(${u.id})'>עדכן סיסמה</button>
      <button onclick='deleteUser(${u.id})'>מחק</button>
    </div>`).join('');
});

function updateUser(id) {
    const pass = document.getElementById(`pass-${id}`).value;
    fetch('/update-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pass })
    }).then(() => alert('עודכן!'));
}

function deleteUser(id) {
    fetch('/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    }).then(() => alert('נמחק!'));
}

window.onload = () => {
    loadAssignments();
    loadAllProjects();
};
