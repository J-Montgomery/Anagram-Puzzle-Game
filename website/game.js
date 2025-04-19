// --- Minimal JS for UI Interaction ---

// Modal Handling
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Close modal if clicking outside the content
window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let i = 0; i < modals.length; i++) {
        if (event.target == modals[i]) {
            modals[i].style.display = 'none';
        }
    }
}

// Easy Mode Toggle
function toggleEasyMode(isEasy) {
    const possibleWordsDiv = document.getElementById('possibleWords');
    if (isEasy) {
        possibleWordsDiv.classList.add('visible');
        // Populate with random words or context-specific words
        const randomWords = puzzle.anagrams.sort(() => 0.5 - Math.random()).slice(0, 5); // Show 5 random
        populateWordList(randomWords);
    } else {
        possibleWordsDiv.classList.remove('visible');
    }
}

let puzzle;
let lastFocusedCell = null;
let solutionFadeOutTimeoutId = null;

function loadPuzzleData() {
    const puzzleDataElement = document.getElementById('puzzle-data');
    if (!puzzleDataElement || puzzleDataElement.type !== 'application/json') {
        console.error('Puzzle data script tag is missing or has incorrect type!');
        return false;
    }

    try {
        const jsonString = puzzleDataElement.textContent;
        const rawPuzzleData = JSON.parse(jsonString);

        // --- Basic Validation ---
        if (!rawPuzzleData.baseWord || !rawPuzzleData.clue || !rawPuzzleData.solutionSentence || !rawPuzzleData.unknowns || !rawPuzzleData.anagrams) {
            console.error('Puzzle data is incomplete.');
            return false;
        }

        const baseWord = rawPuzzleData.baseWord.toUpperCase();
        const unknowns = rawPuzzleData.unknowns;

        // --- Sanity Checks & Layout Calculation ---
        let minRow = 0;
        let maxRow = 0;
        const generatedLayout = [];
        const solutionWords = [baseWord]; // Base word is always index 0

        // Determine vertical bounds based on unknowns
        unknowns.forEach((unknown, index) => {
            const word = unknown.word.toUpperCase();
            const col = unknown.columnIndex;
            const overlap = unknown.overlapIndex;

            // Sanity checks (keep these as they are)
            if (col < 0 || col >= baseWord.length) { throw new Error(`Invalid columnIndex ${col} for word "${word}". Must be between 0 and ${baseWord.length - 1}.`); }
            if (overlap < 0 || overlap >= word.length) { throw new Error(`Invalid overlapIndex ${overlap} for word "${word}". Must be between 0 and ${word.length - 1}.`); }
            if (word[overlap] !== baseWord[col]) { throw new Error(`Character mismatch for word "${word}" at columnIndex ${col}. Expected "${baseWord[col]}", got "${word[overlap]}".`); }

            const topRowForWord = 0 - overlap;
            const bottomRowForWord = 0 + (word.length - 1 - overlap);
            minRow = Math.min(minRow, topRowForWord);
            maxRow = Math.max(maxRow, bottomRowForWord);
            solutionWords.push(word);
        });

        // --- Calculate Final Grid Dimensions and Base Row Offset ---
        const gridCols = baseWord.length;
        const gridRows = maxRow - minRow + 1;
        const baseRowInGrid = 0 - minRow;

        // --- Generate Layout for Base Word (Word Index 0) ---
        for (let i = 0; i < baseWord.length; i++) {
            generatedLayout.push({
                type: 2, // Root word type
                coord: [baseRowInGrid, i],
                char: baseWord[i],
                wordIndex: 0, // Base word index
                letterIndex: i
            });
        }

        // --- Generate Layout for Unknown Words (Word Index 1 onwards) ---
        unknowns.forEach((unknownDef, index) => {
            const word = unknownDef.word.toUpperCase();
            const col = unknownDef.columnIndex;
            const overlap = unknownDef.overlapIndex;
            const wordIndex = index + 1;
            // Get prefilled indices, default to empty array if not provided
            const prefilled = unknownDef.prefilledIndices || [];

            for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
                // Skip the overlap letter (handled by base word)
                if (letterIdx === overlap) {
                    continue;
                }

                const rowInGrid = baseRowInGrid + (letterIdx - overlap);
                const layoutEntry = {
                    coord: [rowInGrid, col],
                    wordIndex: wordIndex,
                    letterIndex: letterIdx
                };

                // *** NEW: Check if this index should be pre-filled ***
                if (prefilled.includes(letterIdx)) {
                    layoutEntry.type = 3; // Assign new type for pre-filled unknown
                    layoutEntry.char = word[letterIdx]; // Add the character
                } else {
                    layoutEntry.type = 1; // Standard unknown type
                    // No char needed for type 1
                }
                generatedLayout.push(layoutEntry);
            }
        });

        // --- Store processed data ---
        puzzle = {
            ...rawPuzzleData,
            baseWord: baseWord,
            gridSize: { rows: gridRows, cols: gridCols },
            layout: generatedLayout,
            solutionWords: solutionWords,
            baseRowInGrid: baseRowInGrid
        };

        return true;

    } catch (error) {
        console.error('Error processing puzzle data:', error);
        document.getElementById('clueText').textContent = `Error: ${error.message}`;
        return false;
    }
}

function generateGrid() {
    // Ensure puzzle data is loaded and valid
    if (!puzzle || !puzzle.gridSize || !puzzle.layout || !puzzle.baseRowInGrid === undefined) {
        console.error("Cannot generate grid: Puzzle data not processed correctly or missing baseRowInGrid.");
        const container = document.getElementById('gridContainer');
        if(container) container.innerHTML = '<p style="color: red;">Error loading puzzle grid.</p>';
        return;
    }

    const container = document.getElementById('gridContainer');
    container.innerHTML = ''; // Clear previous grid content
    container.style.gridTemplateColumns = `repeat(${puzzle.gridSize.cols}, 40px)`;
    container.style.gridTemplateRows = `repeat(${puzzle.gridSize.rows}, 40px)`;

    // Create a map for quick lookup of layout cells by coordinate "row-col"
    const layoutMap = new Map();
    puzzle.layout.forEach(cellDef => {
        const key = `${cellDef.coord[0]}-${cellDef.coord[1]}`;
        // If multiple definitions exist for a coordinate (shouldn't happen with current logic),
        // the last one processed will overwrite previous ones.
        layoutMap.set(key, cellDef);
    });

    // Create grid cell elements based on calculated dimensions and layoutMap
    for (let r = 0; r < puzzle.gridSize.rows; r++) {
        for (let c = 0; c < puzzle.gridSize.cols; c++) {
            const key = `${r}-${c}`;
            const cellDef = layoutMap.get(key); // Get the definition for this coordinate, if any
            let cellElement = null; // Initialize cellElement

            if (cellDef) {
                // Cell has a definition in the layout
                if (cellDef.type === 1) { // Type 1: Unknown (Editable Input)
                    cellElement = document.createElement('input');
                    cellElement.type = 'text';
                    cellElement.maxLength = 1;
                    cellElement.classList.add('grid-cell', 'cell-unknown');
                    // Add data attributes for identification and logic
                    cellElement.dataset.row = r;
                    cellElement.dataset.col = c;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;
                    // Ensure value is uppercase (can also be done on input event)
                    cellElement.style.textTransform = 'uppercase';

                } else if (cellDef.type === 2) { // Type 2: Root Word Cell (Display Div)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-root');
                    cellElement.textContent = cellDef.char || ''; // Display the character
                    // Add data attributes for validation and potential interaction
                    cellElement.dataset.row = r;
                    cellElement.dataset.col = c;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                } else if (cellDef.type === 3) { // Type 3: Pre-filled Unknown Cell (Display Div)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-prefilled-unknown'); // Use specific class
                    cellElement.textContent = cellDef.char || ''; // Display the character
                    // Add data attributes for validation
                    cellElement.dataset.row = r;
                    cellElement.dataset.col = c;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                } else {
                    // Handle potential unknown types or fallback
                    console.warn(`Unknown cell type ${cellDef.type} at [${r}, ${c}]. Rendering as empty.`);
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-empty');
                }

            } else {
                // No definition for this coordinate - it's an empty background cell
                cellElement = document.createElement('div');
                cellElement.classList.add('grid-cell', 'cell-empty');
                // No data attributes needed for purely empty cells
            }

            // Append the created cell element to the container
            if (cellElement) {
                 container.appendChild(cellElement);
            }
        } // End column loop
    } // End row loop

    // Remove existing listeners before adding new ones (prevents duplicates on potential re-renders)
    // Note: This requires storing references or using anonymous functions carefully.
    // A simpler approach for this example is just adding them, assuming generateGrid is called once on load.
    // If re-rendering, proper listener cleanup is crucial.

    // Add event listeners to the container using event delegation
    container.addEventListener('focusin', (event) => {
        if (event.target.matches('.cell-unknown')) {
            lastFocusedCell = event.target; // Update tracker when an input cell gains focus
        }
    });

    container.addEventListener('input', handleGridInput); // Handle character input

    container.addEventListener('keydown', handleGridKeyDown); // Handle Tab, Enter, Backspace
}


// --- Easy Mode Word List Population (Example) ---
function populateWordList(words) {
    const wordListDiv = document.getElementById('wordList');
    wordListDiv.innerHTML = ''; // Clear previous list

    if (!puzzle) return; // Need puzzle data for anagrams

    // Determine words to display (e.g., random, or filtered based on focus)
    // For now, let's just use the provided list or random anagrams
    let displayWords = words;
    if (!displayWords || displayWords.length === 0) {
        // Example: Show N random anagrams if no specific list provided
        displayWords = [...puzzle.anagrams].sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    displayWords.forEach(word => {
        const span = document.createElement('span');
        span.textContent = word;
        // *** UPDATE: Call fillColumnWithWord on click ***
        span.onclick = () => {
            fillColumnWithWord(word.toUpperCase()); // Pass the clicked word (uppercase)
        };
        wordListDiv.appendChild(span);
    });

    // Add placeholder if easy mode is on but no words are shown
    if (displayWords.length === 0 && document.getElementById('easyModeCheckbox')?.checked) {
        wordListDiv.innerHTML = '<i>No suggestions available.</i>'; // Or other message
    } else if (!lastFocusedCell && document.getElementById('easyModeCheckbox')?.checked) {
         // Optional: Guide user if easy mode is on but no cell selected
         // wordListDiv.innerHTML = '<i>Click a cell in a column to see suggestions.</i>';
    }
}

function fillColumnWithWord(word) {
    if (!lastFocusedCell || !lastFocusedCell.matches('.cell-unknown')) {
        // Ensure focus is actually on an input cell before proceeding
        alert("Please click on an input cell in the column you want to fill first.");
        return;
    }
    if (!word || !puzzle || !puzzle.unknowns) return; // Basic safety checks

    const targetCol = parseInt(lastFocusedCell.dataset.col);
    const wordUpper = word.toUpperCase(); // Ensure comparison is case-insensitive

    // Find the definition for the unknown word in this column
    // Note: Assumes only one unknown word per column for simplicity.
    // If multiple words could share a column, this needs adjustment.
    const unknownDef = puzzle.unknowns.find(u => u.columnIndex === targetCol);

    if (!unknownDef) {
        console.error(`Could not find unknown word definition for column ${targetCol}.`);
        alert("Internal error: Puzzle definition missing for this column.");
        return;
    }

    // Check if the clicked word's length matches the expected length from the definition
    if (wordUpper.length !== unknownDef.word.length) {
         alert(`Word "${wordUpper}" (${wordUpper.length} letters) does not match the expected length (${unknownDef.word.length} letters) for this column.`);
         return;
    }


    let fillSuccessful = true; // Flag to track if filling works

    // Iterate through each letter index of the word to be placed
    for (let letterIdx = 0; letterIdx < wordUpper.length; letterIdx++) {
        // Calculate the target row in the grid for this letter
        const targetRow = puzzle.baseRowInGrid + (letterIdx - unknownDef.overlapIndex);

        // Find the specific cell element at the calculated coordinate
        const cellElement = document.querySelector(`.grid-container .grid-cell[data-row="${targetRow}"][data-col="${targetCol}"]`);

        if (!cellElement || cellElement.classList.contains('cell-empty')) {
            // This should not happen if the puzzle layout is correct
            console.error(`Error placing word "${wordUpper}": No valid cell found at [${targetRow}, ${targetCol}] for letter index ${letterIdx}.`);
            alert(`Internal error: Grid layout mismatch for word "${wordUpper}".`);
            fillSuccessful = false;
            break; // Stop trying to fill this word
        }

        const expectedChar = wordUpper[letterIdx];

        // Check the type of cell found
        if (cellElement.matches('.cell-unknown')) {
            // It's an input cell, fill it
            cellElement.value = expectedChar;
        } else if (cellElement.matches('.cell-root') || cellElement.matches('.cell-prefilled-unknown')) {
            // It's a pre-filled div (root overlap or pre-filled unknown)
            // Verify the existing character matches the word being placed
            const existingChar = (cellElement.textContent || '').toUpperCase();
            if (existingChar !== expectedChar) {
                // This suggests the clicked easy mode word is incorrect for the current puzzle state
                 console.warn(`Word "${wordUpper}" conflicts with pre-filled cell at [${targetRow}, ${targetCol}]. Expected "${expectedChar}", found "${existingChar}".`);
                 alert(`Word "${wordUpper}" cannot be placed here because it conflicts with a pre-filled letter ('${existingChar}').`);
                 fillSuccessful = false;
                 // Optional: Clear any inputs already filled for this attempt?
                 // (Could add logic here to revert changes made in this loop if needed)
                 break; // Stop filling
            }
            // If characters match, do nothing - the cell is already correctly filled.
        } else {
            // Should not happen if querySelector is specific enough
            console.error(`Error placing word "${wordUpper}": Unexpected cell type found at [${targetRow}, ${targetCol}].`);
            fillSuccessful = false;
            break;
        }
    } // End loop through letters

    // Trigger solution check only if the fill attempt wasn't aborted
    if (fillSuccessful) {
        checkSolutionAttempt();
        // Optional: Move focus after successful fill
        focusNextCell();
    }
}

function checkSolutionAttempt() {
    if (!puzzle) return;

    const solutionDisplay = document.getElementById('solutionDisplay');
    let allWordsCorrect = true;
    const expectedWords = puzzle.solutionWords;

    // Iterate through word indices
    for (let wordIdx = 0; wordIdx < expectedWords.length; wordIdx++) {
        const expectedWord = expectedWords[wordIdx].toUpperCase();
        let enteredWord = "";

        // Loop through each letter index of the expected word
        for (let letterIdx = 0; letterIdx < expectedWord.length; letterIdx++) {
            let targetRow, targetCol;

            // Calculate the coordinate for this specific letter
            if (wordIdx === 0) { // Base word (index 0)
                targetRow = puzzle.baseRowInGrid;
                targetCol = letterIdx;
            } else { // Unknown word (index 1+)
                const unknownDef = puzzle.unknowns[wordIdx - 1]; // Get definition from original input
                const overlapIndex = unknownDef.overlapIndex;
                targetCol = unknownDef.columnIndex;
                targetRow = puzzle.baseRowInGrid + (letterIdx - overlapIndex);
            }

            // Find the cell element at the calculated coordinate
            // Use querySelector for potentially better performance than filtering all cells
            const cellElement = document.querySelector(`.grid-container .grid-cell[data-row="${targetRow}"][data-col="${targetCol}"]`);

            let char = '';
            if (cellElement) {
                if (cellElement.tagName === 'INPUT') {
                    char = (cellElement.value || '').toUpperCase();
                } else {
                    // Includes root cells (divs) and potentially prefilled (divs)
                    char = (cellElement.textContent || '').toUpperCase();
                }
            } else {
                // Should not happen if layout generation is correct, but good to handle
                console.warn(`Cell not found at [${targetRow}, ${targetCol}] for word ${wordIdx}, letter ${letterIdx}`);
            }
            enteredWord += char;
        } // End loop through letter indices

        // Compare the reconstructed word with the expected word
        if (enteredWord !== expectedWord) {
            console.log(`Mismatch for word ${wordIdx}: Expected "${expectedWord}", Got "${enteredWord}"`); // Debugging line
            allWordsCorrect = false;
            break; // No need to check further words
        }
    } // End loop through word indices

    // Update the solution display (Fade logic remains the same)
    if (allWordsCorrect) {
        if (solutionFadeOutTimeoutId) { clearTimeout(solutionFadeOutTimeoutId); solutionFadeOutTimeoutId = null; }
        solutionDisplay.textContent = puzzle.solutionSentence;
        solutionDisplay.style.opacity = 1;
        console.log('Solution is correct!');
    } else {
        if (solutionDisplay.textContent !== '') {
            console.log('Solution is incorrect!');
            solutionDisplay.style.opacity = 0;
            if (solutionFadeOutTimeoutId) { clearTimeout(solutionFadeOutTimeoutId); }
            solutionFadeOutTimeoutId = setTimeout(() => {
                solutionDisplay.textContent = '';
                solutionFadeOutTimeoutId = null;
            }, 500);
        }
    }
}

function focusNextCell() {
    if (!lastFocusedCell || !puzzle) return;

    const currentCell = lastFocusedCell;
    const startRow = parseInt(currentCell.dataset.row);
    const startCol = parseInt(currentCell.dataset.col);

    // 1. Try finding next EMPTY cell down in the same column (starting from the row AFTER the current one)
    for (let r = startRow + 1; r < puzzle.gridSize.rows; r++) {
        const nextCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${startCol}"]`);
        // *** ADD CHECK: Is the cell empty? ***
        if (nextCell && nextCell.value === '') {
            nextCell.focus();
            return; // Found and focused empty cell
        }
    }

    // 2. Try finding the first EMPTY cell in the next columns to the right
    for (let c = startCol + 1; c < puzzle.gridSize.cols; c++) {
        // Check all rows in this column from top to bottom
        for (let r = 0; r < puzzle.gridSize.rows; r++) {
            const nextCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
             // *** ADD CHECK: Is the cell empty? ***
            if (nextCell && nextCell.value === '') {
                nextCell.focus();
                return; // Found and focused empty cell
            }
        }
    }

    // 3. If still not found, wrap around: Try finding the first EMPTY cell from the top-left
    for (let c = 0; c <= startCol; c++) { // Include current column in wrap-around search
        for (let r = 0; r < puzzle.gridSize.rows; r++) {
             // Don't wrap back to the exact starting cell unless it's the only one
             if (c === startCol && r === startRow) continue;

            const nextCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
             // *** ADD CHECK: Is the cell empty? ***
            if (nextCell && nextCell.value === '') {
                nextCell.focus();
                return; // Found and focused empty cell
            }
        }
    }


    // 4. If no empty cell is found anywhere, do nothing (leave focus as is)
}
function handleBackspace() {
    if (!lastFocusedCell) return;

    const currentCell = lastFocusedCell;
    const currentRow = parseInt(currentCell.dataset.row);
    const currentCol = parseInt(currentCell.dataset.col);

    // If cell has content, just clear it (don't move focus yet)
    if (currentCell.value !== '') {
        currentCell.value = '';
        checkSolutionAttempt(); // Re-check solution after clearing
        return;
    }

    // If cell is already empty, move focus backward

    // 1. Try finding previous cell up in the same column
    for (let r = currentRow - 1; r >= 0; r--) {
        const prevCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${currentCol}"]`);
        if (prevCell) {
            prevCell.focus();
            // prevCell.select(); // Optional
            return; // Found and focused
        }
    }

    // 2. Try finding the last cell in the previous columns to the left
    for (let c = currentCol - 1; c >= 0; c--) {
        for (let r = puzzle.gridSize.rows - 1; r >= 0; r--) { // Check rows bottom-up
            const prevCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
            if (prevCell) {
                prevCell.focus();
                // prevCell.select(); // Optional
                return; // Found and focused
            }
        }
    }
    // If no previous cell, do nothing
}

function handleVirtualKeyboardClick(event) {
    if (!event.target.matches('.key')) return; // Ignore clicks not on keys

    const key = event.target.textContent;

    if (!lastFocusedCell) {
        // Maybe focus the first input cell if none is selected?
        const firstInput = document.querySelector('.grid-cell.cell-unknown');
        if (firstInput) firstInput.focus();
        if (!lastFocusedCell) return; // Still no focusable cell
    }

    if (key === 'Enter') {
        focusNextCell();
    } else if (key === '⌫') { // Backspace
        handleBackspace();
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') { // Letter key
        lastFocusedCell.value = key;
        checkSolutionAttempt(); // Check after input
        focusNextCell();      // Move to next cell
    }
}

function handleGridInput(event) {
    if (!event.target.matches('.cell-unknown')) return;

    // Ensure input is uppercase (optional)
    event.target.value = event.target.value.toUpperCase();

    checkSolutionAttempt(); // Check solution after any input

    // Auto-advance if a single character was entered
    if (event.target.value.length === 1) {
         // Use setTimeout to allow the input event to fully resolve before changing focus
         setTimeout(focusNextCell, 0);
    }
}

// *** EVENT HANDLER for physical keyboard special keys (Tab, Backspace, Enter) in the grid ***
function handleGridKeyDown(event) {
    if (!event.target.matches('.cell-unknown')) return;

    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default Enter behavior (like form submission)
        focusNextCell();
    } else if (event.key === 'Tab') {
        event.preventDefault(); // Prevent default Tab behavior
        focusNextCell(); // Use our custom focus logic
    } else if (event.key === 'Backspace') {
        // If the cell is already empty when backspace is pressed, trigger backward movement
        if (event.target.value === '') {
            event.preventDefault(); // Prevent default backspace (which might navigate back)
            handleBackspace(); // Move focus backward
        }
        // If the cell is not empty, the default backspace will clear it,
        // and the subsequent 'input' event will handle the checkSolutionAttempt.
    }
    // Let other keys (like letters, arrows if desired) perform their default action
}



// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Load, process, and validate puzzle data
    if (!loadPuzzleData()) {
        // Error message is handled within loadPuzzleData
        return; // Stop initialization
    }

    // Setup UI using the processed 'puzzle' object
    document.getElementById('clueText').textContent = `Clue: ${puzzle.clue}`;
    generateGrid(); // Generate the grid using calculated layout/size

    const firstInputCell = document.querySelector('.grid-cell.cell-unknown');
    if (firstInputCell) {
        lastFocusedCell = firstInputCell; // Set initial tracker
        // Optional: Uncomment the next line if you want the grid to have focus immediately on load
        firstInputCell.focus();
    }

    // Easy mode check (keep as is)
    const easyModeCheckbox = document.getElementById('easyModeCheckbox');
    if (easyModeCheckbox?.checked) { toggleEasyMode(true); }

    // Input listener (keep as is)
    const gridContainer = document.getElementById('gridContainer');
    if (gridContainer) {
        gridContainer.addEventListener('input', (event) => {
            if (event.target.matches('.cell-unknown')) {
                checkSolutionAttempt();
            }
        });
    }

    const keyboard = document.getElementById('keyboard');
    if (keyboard) {
        keyboard.addEventListener('click', handleVirtualKeyboardClick);
    }

    // Initialize solution display (keep as is)
    const solutionDisplay = document.getElementById('solutionDisplay');
    solutionDisplay.textContent = '';
    solutionDisplay.style.opacity = 0;
});
