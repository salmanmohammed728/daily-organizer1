
// ===================================
// MY DAILY ORGANIZER
// Main JavaScript
// ===================================

// Get HTML elements
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const priorityInput = document.getElementById("priority");
const taskList = document.getElementById("taskList");

const totalTasks = document.getElementById("totalTasks");
const completedTasks = document.getElementById("completedTasks");
const remainingTasks = document.getElementById("remainingTasks");

const notesInput = document.getElementById("notesInput");
const currentDate = document.getElementById("currentDate");

// ===================================
// DATA STORAGE
// ===================================

let tasks = JSON.parse(localStorage.getItem("organizerTasks")) || [];

function saveTasks() {
    localStorage.setItem("organizerTasks", JSON.stringify(tasks));
}

// ===================================
// DISPLAY CURRENT DATE
// ===================================

currentDate.textContent = new Date().toLocaleDateString(
    "en-US",
    {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    }
);

// ===================================
// ADD NEW TASK
// ===================================

taskForm.addEventListener("submit", function(event) {

    event.preventDefault();

    const taskName = taskInput.value.trim();
    const priority = priorityInput.value;

    if (taskName === "") {
        return;
    }

    const newTask = {
        id: Date.now(),
        name: taskName,
        priority: priority,
        completed: false
    };

    tasks.push(newTask);

    saveTasks();
    displayTasks();

    taskInput.value = "";
    priorityInput.value = "Low";

});

// ===================================
// DISPLAY TASKS
// ===================================

function displayTasks() {

    taskList.innerHTML = "";

    tasks.forEach(function(task) {

        const li = document.createElement("li");

        if (task.completed) {
            li.classList.add("completed");
        }

        // Checkbox
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed;

        checkbox.addEventListener("change", function() {
            task.completed = checkbox.checked;
            saveTasks();
            displayTasks();
        });

        // Task name and priority
        const span = document.createElement("span");
        span.textContent = task.name + " (" + task.priority + ")";

        // Delete button
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", function() {
            tasks = tasks.filter(function(item) {
                return item.id !== task.id;
            });

            saveTasks();
            displayTasks();
        });

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(deleteButton);

        taskList.appendChild(li);

    });

    updateStatistics();
}

// ===================================
// UPDATE STATISTICS
// ===================================

function updateStatistics() {

    const total = tasks.length;

    const completed = tasks.filter(function(task) {
        return task.completed;
    }).length;

    const remaining = total - completed;

    totalTasks.textContent = total;
    completedTasks.textContent = completed;
    remainingTasks.textContent = remaining;
}

// ===================================
// SAVE NOTES
// ===================================

notesInput.value = localStorage.getItem("organizerNotes") || "";

notesInput.addEventListener("input", function() {
    localStorage.setItem("organizerNotes", notesInput.value);
});

// ===================================
// INITIALIZE WEBSITE
// ===================================

displayTasks();
