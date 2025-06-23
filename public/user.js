// פונקציה לטעינת בניינים שהמשתמש משויך אליהם
function loadUserBuildings() {
    fetch('/my-buildings')  // קוראים לנתיב שמחזיר את הבניינים לפי session (משתמש מחובר)
        .then(res => {
            if (!res.ok) throw new Error('שגיאה בטעינת הבניינים של המשתמש');
            return res.json();
        })
        .then(buildings => {
            const container = document.getElementById('userBuildingsContainer');
            if (!container) {
                alert('לא נמצא אלמנט להצגת הבניינים');
                return;
            }

            if (buildings.length === 0) {
                container.innerHTML = '<p>אין בניינים משוייכים למשתמש זה.</p>';
                return;
            }

            // בונים מפה של פרויקטים וכתובות
            const projectsMap = {};
            buildings.forEach(b => {
                if (!projectsMap[b.project]) projectsMap[b.project] = [];
                projectsMap[b.project].push(b.address);
            });

            container.innerHTML = ''; // נקה קודם

            for (const [project, addresses] of Object.entries(projectsMap)) {
                const projectDiv = document.createElement('div');
                projectDiv.innerHTML = `<h4>פרויקט: ${project}</h4>`;
                const ul = document.createElement('ul');
                addresses.forEach(address => {
                    const li = document.createElement('li');
                    li.textContent = address;
                    ul.appendChild(li);
                });
                projectDiv.appendChild(ul);
                container.appendChild(projectDiv);
            }
        })
        .catch(err => {
            alert(err.message);
            console.error(err);
        });
}

// קריאה לטעינת בניינים לאחר שהמשתמש מחובר (למשל בטעינת הדף)
window.addEventListener('DOMContentLoaded', () => {
    loadUserBuildings();
});
