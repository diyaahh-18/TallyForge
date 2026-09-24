# ⚡ TallyForge

> **Dual-Stream Productivity & Expense Analytics Engine**

TallyForge is a gamified, dual-stream SaaS dashboard engineered to track and optimize two core metrics in parallel: **focus time spent** and **financial capital deployed**. Designed with a bold "Maximalist/Dopamine" aesthetic, it combines real-time predictive analytics with natural-language logging and interactive sandbox simulations.

---

## ✨ Key Features

* **✨ Vibe Logger:** A natural-language command bar that parses mixed multi-metric inputs (e.g., *"Spent ₹250 on coffee and studied Algo for 3.5 hrs #ExamPrep"*) into structured expense and focus entries automatically.
* **⚡ Live Focus ROI & Stress Simulator:** Interactive slider sandbox recalculating real-time cost-per-focused-hour (`₹/hr`), projected knowledge hours, and dynamic burnout/stress gauges.
* **📊 Dual-Stream Chart Analytics:** Synchronized Chart.js visualizations tracking study performance alongside financial metrics across flexible timeframes.
* **🏆 Milestone Badges & Gamification:** Interactive achievement system complete with micro-progress bars, hover animations, and streak tracking.
* **🔥 Dynamic Heatmap Matrix:** Annual activity matrix tracking consistency with seamless light/dark mode theme support.
* **🌓 Dual Theme System:** High-contrast Dark Cosmic palette and crisp Light Mode theme with adaptive WCAG-compliant contrast levels.

---

## 🛠️ Tech Stack

* **Backend:** Flask (Python 3.x), REST API Endpoints
* **Frontend:** Vanilla HTML5, CSS3 (CSS Variables, Grid/Flexbox, Keyframes), JavaScript (ES6+)
* **Data Visualization:** Chart.js
* **Version Control & Deployment:** Git, GitHub, PWA Ready

---

## 🚀 Getting Started

### Prerequisites
* Python 3.8+ installed on your system.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/diyaahh-18/TallyForge.git
   cd TallyForge
   ```

2. **Install dependencies:**
   ```bash
   pip install flask werkzeug
   ```

3. **Run the application:**
   ```bash
   python app.py
   ```

4. **Open in your browser:**
   Navigate to `http://127.0.0.1:8080` (or `http://localhost:8080`).

---

## 📂 Project Structure

```
productivity-expense-tracker/
├── app.py                # Flask backend with REST API & authentication
├── data.json             # JSON file storage for users, study logs & expenses
├── requirements.txt      # Python dependencies
├── README.md             # Project documentation & overview
└── public/
    ├── index.html        # Main SPA frontend dashboard & landing page
    ├── style.css         # Maximalist design system, themes & animations
    └── script.js         # Frontend controller, Chart.js graphs, Vibe parser & gamification
```

---

## 🎮 Gamification & Levels System

TallyForge features a complete RPG-style progression engine:

| Tier | Badge Name | Requirement | XP Reward |
| :--- | :--- | :--- | :--- |
| 🥉 Bronze | First Spark | Log your first study session | 50 XP |
| 🥉 Bronze | Frugal Start | Log your first expense record | 50 XP |
| 🥈 Silver | 3-Day Momentum | Maintain a 3-day active streak | 150 XP |
| 🥈 Silver | Deep Focus | Log 10.0+ hours in a single subject | 150 XP |
| 🥇 Gold | Century Club | Reach 100.0 lifetime study hours | 300 XP |
| 🥇 Gold | Budget Guardian | 7 active days under daily limit | 300 XP |
| 💎 Diamond | Iron Discipline | 14-day study streak with zero budget breaches | 500 XP |
| 💎 Diamond | Zenith Scholar | Accumulate 200+ lifetime study hours | 500 XP |

---

## 🔒 Security & Privacy

* Passwords securely hashed with `werkzeug.security` (PBKDF2/SHA256).
* User data partitioned per account session.
* Demo mode available for instant interactive exploration without registration.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
