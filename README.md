# CPC Fast Lane (Medical Coding Exam Prep)

A static, offline-capable, single-page web application (SPA) built with Vanilla JavaScript, HTML5, and CSS for practicing medical coding (CPC) exam questions.

This application is designed to be hosted for free on platforms like GitHub Pages, as it requires no backend server. All data persistence (user progress, settings, and authentication) is handled via **localStorage**.

## 🚀 Setup & Deployment

1.  **Clone or Download**: Download this entire folder structure to your local machine.
2.  **Populate Quiz Data**: Open `data/questions.json` and replace the 5 sample questions with your full set of 100 questions. Ensure the format adheres to the required JSON structure.
3.  **Configure Stripe**: In `script.js`, replace the placeholder public key with your actual Stripe Publishable Key:
    ```javascript
    // **TODO: REPLACE WITH YOUR LIVE STRIPE PUBLISHABLE KEY**
    const STRIPE_PK = 'pk_test_TYaWkK8TYKk0mQ2vF6zIu94E';
    ```
4.  **GitHub Pages**:
    * Create a new GitHub repository and push the entire `cpc-fast-lane-website` folder content to the `main` branch.
    * Go to **Settings > Pages** for the repository.
    * Set the source to `Deploy from a branch` and select the `main` branch (or `master`) and the root `/` folder.
    * Save and wait a few minutes for the site to deploy.

## 💾 Data Source Format

Your `data/questions.json` file must be an array of objects structured as follows:

```json
[
  {
    "id": 1,
    "category": "Anesthesia",
    "question": "Vignette or question stem here...",
    "optionA": "Option A text",
    "optionB": "Option B text",
    "optionC": "Option C text",
    "optionD": "Option D text",
    "correctAnswer": "A",
    "rationale": "Detailed explanation of the answer."
  }
]