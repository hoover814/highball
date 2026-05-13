/**
 * Highball — Backend (Google Apps Script)
 * =========================================
 * Shared-library backend. All users see one shared collection
 * of recipes, but each user has their own private ratings
 * and tasting notes. Only the creator (or sheet owner) can
 * delete a recipe.
 *
 * Sheet tabs (auto-created):
 *   - Users:    email | display_name | created_at | last_seen
 *   - Recipes:  id | creator_email | creator_name | name | tagline |
 *               base | swatch | method | time | skill | ingredients |
 *               steps | source | created_at | updated_at
 *   - Ratings:  user_email | recipe_id | rating | notes | updated_at
 */

const SHEET_NAMES = {
  users: 'Users',
  recipes: 'Recipes',
  ratings: 'Ratings',
};

const USER_COLS = ['email', 'display_name', 'created_at', 'last_seen'];
const RECIPE_COLS = [
  'id', 'creator_email', 'creator_name', 'name', 'tagline',
  'base', 'swatch', 'method', 'time', 'skill', 'ingredients',
  'steps', 'source', 'created_at', 'updated_at'
];
const RATING_COLS = ['user_email', 'recipe_id', 'rating', 'notes', 'updated_at'];

// ============================
// Entry points
// ============================
function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  try {
    ensureSheets_();
    const params = (e && e.parameter) || {};
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (_) {}
    }
    const data = Object.assign({}, params, body);
    const action = data.action || '';

    let result;
    switch (action) {
      case 'ping':          result = { ok: true, pong: true }; break;
      case 'signin':        result = signIn_(data); break;
      case 'getRecipes':    result = getRecipes_(data); break;
      case 'saveRecipe':    result = saveRecipe_(data); break;
      case 'updateRecipe':  result = updateRecipe_(data); break;
      case 'deleteRecipe':  result = deleteRecipe_(data); break;
      case 'saveRating':    result = saveRating_(data); break;
      case 'updateProfile': result = updateProfile_(data); break;
      default:              result = { ok: false, error: 'Unknown action: ' + action };
    }
    return jsonOut_(result);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

// ============================
// Users
// ============================
function signIn_(data) {
  const email = normEmail_(data.email);
  const name = (data.name || '').toString().trim();
  if (!email) return { ok: false, error: 'Email required' };
  if (!isValidEmail_(email)) return { ok: false, error: 'Invalid email' };

  const sheet = getSheet_(SHEET_NAMES.users);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const emailIdx = header.indexOf('email');
  const nameIdx = header.indexOf('display_name');
  const lastSeenIdx = header.indexOf('last_seen');

  const now = new Date().toISOString();
  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (normEmail_(rows[i][emailIdx]) === email) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    sheet.appendRow([email, name || email.split('@')[0], now, now]);
    return {
      ok: true,
      user: { email, displayName: name || email.split('@')[0], isNew: true }
    };
  } else {
    sheet.getRange(foundRow, lastSeenIdx + 1).setValue(now);
    if (name) sheet.getRange(foundRow, nameIdx + 1).setValue(name);
    const currentName = sheet.getRange(foundRow, nameIdx + 1).getValue();
    return {
      ok: true,
      user: { email, displayName: currentName || email.split('@')[0], isNew: false }
    };
  }
}

function updateProfile_(data) {
  const email = normEmail_(data.email);
  if (!email) return { ok: false, error: 'Email required' };
  const name = (data.name || '').toString().trim();
  if (!name) return { ok: false, error: 'Name required' };

  // Update user's display name
  const userSheet = getSheet_(SHEET_NAMES.users);
  const userRows = userSheet.getDataRange().getValues();
  const userHeader = userRows[0];
  const uEmailIdx = userHeader.indexOf('email');
  const uNameIdx = userHeader.indexOf('display_name');
  let updated = false;
  for (let i = 1; i < userRows.length; i++) {
    if (normEmail_(userRows[i][uEmailIdx]) === email) {
      userSheet.getRange(i + 1, uNameIdx + 1).setValue(name);
      updated = true;
      break;
    }
  }
  if (!updated) return { ok: false, error: 'User not found' };

  // Also update creator_name on any recipes this user created,
  // so the "by Jacob" label updates everywhere
  const recipeSheet = getSheet_(SHEET_NAMES.recipes);
  const recipeRows = recipeSheet.getDataRange().getValues();
  if (recipeRows.length > 1) {
    const rHeader = recipeRows[0];
    const rCreatorEmailIdx = rHeader.indexOf('creator_email');
    const rCreatorNameIdx = rHeader.indexOf('creator_name');
    for (let i = 1; i < recipeRows.length; i++) {
      if (normEmail_(recipeRows[i][rCreatorEmailIdx]) === email) {
        recipeSheet.getRange(i + 1, rCreatorNameIdx + 1).setValue(name);
      }
    }
  }

  return { ok: true };
}

// ============================
// Recipes (shared)
// ============================
function getRecipes_(data) {
  const email = normEmail_(data.email);
  if (!email) return { ok: false, error: 'Email required' };

  // Read recipes (shared by all)
  const recipeSheet = getSheet_(SHEET_NAMES.recipes);
  const recipeRows = recipeSheet.getDataRange().getValues();

  // Read this user's ratings only
  const ratingSheet = getSheet_(SHEET_NAMES.ratings);
  const ratingRows = ratingSheet.getDataRange().getValues();
  const ratingsByRecipe = {};
  if (ratingRows.length > 1) {
    const rHeader = ratingRows[0];
    const userIdx = rHeader.indexOf('user_email');
    const ridIdx = rHeader.indexOf('recipe_id');
    const ratingIdx = rHeader.indexOf('rating');
    const notesIdx = rHeader.indexOf('notes');
    for (let i = 1; i < ratingRows.length; i++) {
      if (normEmail_(ratingRows[i][userIdx]) === email) {
        ratingsByRecipe[ratingRows[i][ridIdx]] = {
          rating: Number(ratingRows[i][ratingIdx]) || 0,
          notes: ratingRows[i][notesIdx] || '',
        };
      }
    }
  }

  if (recipeRows.length < 2) return { ok: true, recipes: [] };

  const header = recipeRows[0];
  const recipes = [];
  for (let i = 1; i < recipeRows.length; i++) {
    const obj = rowToObject_(header, recipeRows[i]);
    const r = deserializeRecipe_(obj);
    const myRating = ratingsByRecipe[r.id] || { rating: 0, notes: '' };
    r.rating = myRating.rating;
    r.notes = myRating.notes;
    r.isMine = normEmail_(obj.creator_email) === email;
    recipes.push(r);
  }
  recipes.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return { ok: true, recipes };
}

function saveRecipe_(data) {
  const email = normEmail_(data.email);
  const recipe = data.recipe;
  if (!email || !recipe) return { ok: false, error: 'Email and recipe required' };

  // Look up creator display name
  const creatorName = getUserName_(email) || email.split('@')[0];

  const sheet = getSheet_(SHEET_NAMES.recipes);
  const id = recipe.id || ('r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  const now = new Date().toISOString();

  sheet.appendRow([
    id,
    email,
    creatorName,
    recipe.name || 'Untitled',
    recipe.tagline || '',
    recipe.base || '',
    recipe.swatch || 'amber',
    recipe.method || '',
    recipe.time || '',
    recipe.skill || 'Easy',
    JSON.stringify(recipe.ingredients || []),
    recipe.steps || '',
    recipe.source || 'user',
    recipe.addedAt ? new Date(recipe.addedAt).toISOString() : now,
    now,
  ]);
  return { ok: true, id, creatorName };
}

function updateRecipe_(data) {
  // Only the creator can update the recipe itself (name, ingredients, etc).
  // Ratings/notes are handled by saveRating_ — per user.
  const email = normEmail_(data.email);
  const recipe = data.recipe;
  if (!email || !recipe || !recipe.id) return { ok: false, error: 'Email and recipe.id required' };

  const sheet = getSheet_(SHEET_NAMES.recipes);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const idIdx = header.indexOf('id');
  const creatorIdx = header.indexOf('creator_email');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIdx] === recipe.id) {
      if (normEmail_(rows[i][creatorIdx]) !== email) {
        return { ok: false, error: 'Only the creator can edit this recipe' };
      }
      const updates = {
        name: recipe.name,
        tagline: recipe.tagline,
        base: recipe.base,
        swatch: recipe.swatch,
        method: recipe.method,
        time: recipe.time,
        skill: recipe.skill,
        steps: recipe.steps,
        updated_at: new Date().toISOString(),
      };
      if (recipe.ingredients !== undefined) {
        updates.ingredients = JSON.stringify(recipe.ingredients || []);
      }
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          const col = header.indexOf(key);
          if (col !== -1) sheet.getRange(i + 1, col + 1).setValue(updates[key]);
        }
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Recipe not found' };
}

function deleteRecipe_(data) {
  // Only the creator can delete.
  const email = normEmail_(data.email);
  const id = data.id;
  if (!email || !id) return { ok: false, error: 'Email and id required' };

  const sheet = getSheet_(SHEET_NAMES.recipes);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const idIdx = header.indexOf('id');
  const creatorIdx = header.indexOf('creator_email');

  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][idIdx] === id) {
      if (normEmail_(rows[i][creatorIdx]) !== email) {
        return { ok: false, error: 'Only the creator can delete this recipe' };
      }
      sheet.deleteRow(i + 1);

      // Also clean up all ratings/notes for this recipe across users
      const rSheet = getSheet_(SHEET_NAMES.ratings);
      const rRows = rSheet.getDataRange().getValues();
      if (rRows.length > 1) {
        const rHeader = rRows[0];
        const ridIdx = rHeader.indexOf('recipe_id');
        for (let j = rRows.length - 1; j >= 1; j--) {
          if (rRows[j][ridIdx] === id) {
            rSheet.deleteRow(j + 1);
          }
        }
      }
      return { ok: true };
    }
  }
  return { ok: false, error: 'Recipe not found' };
}

// ============================
// Ratings (private per-user)
// ============================
function saveRating_(data) {
  const email = normEmail_(data.email);
  const recipeId = data.recipeId;
  if (!email || !recipeId) return { ok: false, error: 'Email and recipeId required' };

  const rating = (data.rating === undefined) ? null : Number(data.rating);
  const notes = (data.notes === undefined) ? null : (data.notes || '').toString();

  const sheet = getSheet_(SHEET_NAMES.ratings);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const userIdx = header.indexOf('user_email');
  const ridIdx = header.indexOf('recipe_id');
  const ratingIdx = header.indexOf('rating');
  const notesIdx = header.indexOf('notes');
  const updatedIdx = header.indexOf('updated_at');
  const now = new Date().toISOString();

  // Find existing row for (user, recipe)
  for (let i = 1; i < rows.length; i++) {
    if (normEmail_(rows[i][userIdx]) === email && rows[i][ridIdx] === recipeId) {
      if (rating !== null) sheet.getRange(i + 1, ratingIdx + 1).setValue(rating);
      if (notes !== null)  sheet.getRange(i + 1, notesIdx + 1).setValue(notes);
      sheet.getRange(i + 1, updatedIdx + 1).setValue(now);
      return { ok: true };
    }
  }

  // No existing row — append a new one
  sheet.appendRow([
    email,
    recipeId,
    rating !== null ? rating : 0,
    notes !== null ? notes : '',
    now,
  ]);
  return { ok: true };
}

// ============================
// Helpers
// ============================
function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_NAMES.users, USER_COLS);
  ensureSheet_(ss, SHEET_NAMES.recipes, RECIPE_COLS);
  ensureSheet_(ss, SHEET_NAMES.ratings, RATING_COLS);
}
function ensureSheet_(ss, name, cols) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(cols);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(cols);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}
function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}
function getUserName_(email) {
  const sheet = getSheet_(SHEET_NAMES.users);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const emailIdx = header.indexOf('email');
  const nameIdx = header.indexOf('display_name');
  for (let i = 1; i < rows.length; i++) {
    if (normEmail_(rows[i][emailIdx]) === email) return rows[i][nameIdx];
  }
  return '';
}
function rowToObject_(header, row) {
  const obj = {};
  for (let i = 0; i < header.length; i++) obj[header[i]] = row[i];
  return obj;
}
function deserializeRecipe_(row) {
  let ingredients = [];
  try { ingredients = JSON.parse(row.ingredients || '[]'); } catch (_) {}
  return {
    id: row.id,
    creatorEmail: row.creator_email,
    creatorName: row.creator_name || '',
    name: row.name,
    tagline: row.tagline,
    base: row.base,
    swatch: row.swatch,
    method: row.method,
    time: row.time,
    skill: row.skill,
    ingredients: ingredients,
    steps: row.steps,
    source: row.source,
    addedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}
function normEmail_(e) {
  return (e || '').toString().trim().toLowerCase();
}
function isValidEmail_(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
