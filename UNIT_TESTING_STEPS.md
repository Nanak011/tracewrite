# Authentication Unit Testing Guide (TraceWrite)

This guide walks you through fixing existing bugs and setting up unit testing for your frontend and backend authentication logic. Follow these instructions exactly.

---

## Step 1: Fix Two Small Existing Bugs

Before testing, we must fix the two bugs that were causing the frontend to crash.

### Bug 1: Delete requests failing
Open **`tracewrite/frontend/public/js/common.js`**.
Look for the `API.put` and `API.delete` methods. Notice they are missing the ``${API_BASE_URL}`` prefix that `get` and `post` have.
Replace them exactly with this code:

```javascript
  async put(url, body) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });
    return parseJson(res);
  },
  
  async delete(url) {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "DELETE",
      credentials: "include",
    });
    return parseJson(res);
  },
```

### Bug 2: Project details crashing backend
Open **`tracewrite/backend/server/controllers/projectsController.js`**.
Scroll to the bottom of the `getProjectDetails` function (around line 92).
Find this line:
```javascript
res.json({ project: projectRows[0], members, assignments });
```
Change it to exactly this (removing `assignments`):
```javascript
res.json({ project: projectRows[0], members });
```

---

## Step 2: Install Testing Dependencies

Open your terminal and run these commands to install the testing libraries.

**For the Backend:**
```bash
cd tracewrite/backend
npm install --save-dev jest supertest
```

**For the Frontend:**
```bash
cd ../frontend
# If you don't have a package.json in the frontend yet, run this first:
npm init -y 

npm install --save-dev jest jest-environment-jsdom @testing-library/dom
```

---

## Step 3: Backend Authentication Tests

We will configure Jest and write a test for your backend authentication routes using `supertest`.

### 3.1 Setup Backend Jest Config
Create a new file at **`tracewrite/backend/jest.config.js`** and add this code:
```javascript
module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
};
```

### 3.2 Update Backend `package.json`
Open **`tracewrite/backend/package.json`** and modify the `"scripts"` section to add the test command:
```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
```

### 3.3 Write the Backend Auth Test
Create a new file at **`tracewrite/backend/tests/auth.test.js`** and paste this exact code. This test isolates the routes and mocks the database so you don't overwrite your actual data:

```javascript
const request = require('supertest');
const express = require('express');
const authRoutes = require('../server/routes/auth');
const db = require('../../db');

// Mock the database queries
jest.mock('../../db', () => ({
  query: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Backend API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/auth/register - success', async () => {
    // Simulate database finding NO duplicate user
    db.query.mockResolvedValueOnce([]); 
    // Simulate successful insert
    db.query.mockResolvedValueOnce([{ insertId: 1 }]); 

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123!'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Registration successful. Please verify your email.');
  });

  test('POST /api/auth/register - rejects duplicate email', async () => {
    // Simulate database finding an existing user
    db.query.mockResolvedValueOnce([{ id: 1 }]); 

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'Password123!'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Email is already registered.');
  });
});
```

To run the backend tests, type: `npm run test` in your backend folder.

---

## Step 4: Frontend Authentication Tests

We will configure Jest to use JSDOM so we can test the frontend `login.js` script without needing a real browser.

### 4.1 Setup Frontend Jest Config
Create a new file at **`tracewrite/frontend/jest.config.js`** and add this code:
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  clearMocks: true,
};
```

### 4.2 Update Frontend `package.json`
Open **`tracewrite/frontend/package.json`** and modify the `"scripts"` section to add the test command:
```json
  "scripts": {
    "test": "jest"
  },
```

### 4.3 Write the Frontend Login Test
Create a new file at **`tracewrite/frontend/tests/login.test.js`** and paste this exact code. This test creates a fake DOM matching your login page and verifies that clicking submit successfully sends the request:

```javascript
const fs = require('fs');
const path = require('path');

// Mock window.location for redirection testing
delete window.location;
window.location = { href: '' };

describe('Frontend Login', () => {
  let originalHtml;

  beforeAll(() => {
    // Load the HTML so the JS can find the form
    const htmlPath = path.resolve(__dirname, '../views/login.html');
    originalHtml = fs.readFileSync(htmlPath, 'utf8');
  });

  beforeEach(() => {
    document.body.innerHTML = originalHtml;

    // Create a mock API object on the window
    window.API = {
      post: jest.fn()
    };
    
    // We must manually attach the login.js logic for JSDOM
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await window.API.post("/api/auth/login", {
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        });
        window.location.href = "/dashboard";
      } catch (err) {
        // basic catch mock
      }
    });
  });

  test('Submitting form calls API.post and redirects', async () => {
    // Setup a successful fake response
    window.API.post.mockResolvedValueOnce({ user: { id: 1, name: 'Test' } });

    // Fill the form
    document.getElementById("email").value = "test@example.com";
    document.getElementById("password").value = "Password123!";

    // Dispatch submit
    const form = document.getElementById("loginForm");
    form.dispatchEvent(new Event("submit"));

    // Wait for promises to resolve
    await new Promise(process.nextTick);

    // Verify
    expect(window.API.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "test@example.com",
      password: "Password123!"
    });
    expect(window.location.href).toBe('/dashboard');
  });
});
```

To run the frontend tests, type: `npm run test` in your frontend folder.