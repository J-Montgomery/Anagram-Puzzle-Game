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
        unknowns.forEach((unknown, index) => {
            const word = unknown.word.toUpperCase();
            const col = unknown.columnIndex;
            const overlap = unknown.overlapIndex;
            const wordIndex = index + 1; // Unknown words start from index 1

            for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
                // *** FIX: Only add layout entry if NOT the overlap letter ***
                if (letterIdx !== overlap) {
                    const rowInGrid = baseRowInGrid + (letterIdx - overlap);
                    generatedLayout.push({
                        type: 1, // Unknown word type
                        coord: [rowInGrid, col],
                        // char: word[letterIdx], // Don't prefill unknowns
                        wordIndex: wordIndex,
                        letterIndex: letterIdx
                    });
                }
                // If letterIdx === overlap, we simply skip adding an entry.
                // The base word's entry at this coordinate will be used by generateGrid.
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
    if (!puzzle || !puzzle.gridSize || !puzzle.layout) {
        console.error("Cannot generate grid: Puzzle data not processed correctly.");
        return;
    }
    const container = document.getElementById('gridContainer');
    container.innerHTML = ''; // Clear previous grid
    container.style.gridTemplateColumns = `repeat(${puzzle.gridSize.cols}, 40px)`;
    container.style.gridTemplateRows = `repeat(${puzzle.gridSize.rows}, 40px)`;

    // Create a map for quick lookup of layout cells by coordinate
    const layoutMap = new Map();
    puzzle.layout.forEach(cellDef => {
        const key = `${cellDef.coord[0]}-${cellDef.coord[1]}`;
        layoutMap.set(key, cellDef);
    });

    // Create grid elements based on calculated dimensions
    for (let r = 0; r < puzzle.gridSize.rows; r++) {
        for (let c = 0; c < puzzle.gridSize.cols; c++) {
            const key = `${r}-${c}`;
            const cellDef = layoutMap.get(key);
            let cellElement;

            if (cellDef) {
                if (cellDef.type === 1) { // Unknown
                    cellElement = document.createElement('input');
                    cellElement.type = 'text';
                    cellElement.maxLength = 1;
                    cellElement.classList.add('grid-cell', 'cell-unknown');
                    cellElement.dataset.row = r;
                    cellElement.dataset.col = c;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;
                } else { // Root (type 2) or potentially Prefilled (type 3 - if added later)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell');
                    cellElement.textContent = cellDef.char || '';
                    if (cellDef.type === 2) {
                        cellElement.classList.add('cell-root');
                    }
                    // Add data attributes for consistency if needed by other logic
                    cellElement.dataset.row = r; // *** ADD THIS ***
                    cellElement.dataset.col = c; // *** ADD THIS ***
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;
                }
            } else { // Empty
                cellElement = document.createElement('div');
                cellElement.classList.add('grid-cell', 'cell-empty');
            }
            container.appendChild(cellElement);
        }
    }

    container.addEventListener('focusin', (event) => {
        if (event.target.matches('.cell-unknown')) {
            lastFocusedCell = event.target; // Update tracker
        }
    });

    // Add listener for input events (modified later)
    container.addEventListener('input', handleGridInput);

    // Add listener for keydown events within the grid (for Tab, Backspace, Enter)
    container.addEventListener('keydown', handleGridKeyDown);
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
    if (!lastFocusedCell) {
        alert("Please click on a cell in the column you want to fill first.");
        return;
    }
    if (!word) return;

    const targetCol = lastFocusedCell.dataset.col;

    // Find all input cells in the target column
    const columnCells = document.querySelectorAll(`.grid-cell.cell-unknown[data-col="${targetCol}"]`);

    // Sort them by row index to ensure top-to-bottom order
    const sortedCells = Array.from(columnCells).sort((a, b) =>
        parseInt(a.dataset.row) - parseInt(b.dataset.row)
    );

    // Check if the number of cells matches the word length
    // This is a basic check; more sophisticated filtering might be needed
    // depending on how easy mode suggestions are generated.
    if (sortedCells.length !== word.length) {
         // Find the cell corresponding to the overlap index for this column
         const unknownDef = puzzle.unknowns.find(u => u.columnIndex == targetCol);
         const overlapRow = unknownDef ? puzzle.baseRowInGrid + (unknownDef.overlapIndex - unknownDef.overlapIndex) : -1; // This simplifies to baseRowInGrid
         const overlapCell = document.querySelector(`.grid-cell.cell-root[data-row="${puzzle.baseRowInGrid}"][data-col="${targetCol}"]`);

         // We need to account for the overlapping letter which is NOT an input
         if (overlapCell && sortedCells.length === word.length -1) {
            // This is the expected case: word length is one more than input cells
            let letterIndex = 0;
            for(let i = 0; i < word.length; i++) {
                const expectedRow = puzzle.baseRowInGrid + (i - unknownDef.overlapIndex);
                if (expectedRow === puzzle.baseRowInGrid) {
                    // This is the overlap position, skip assigning to input
                    continue;
                }
                // Find the corresponding input cell (should exist)
                const targetCell = sortedCells[letterIndex];
                if (targetCell) {
                     targetCell.value = word[i];
                     letterIndex++;
                } else {
                    console.warn(`Mismatch: Expected input cell for letter ${word[i]} not found.`);
                    break; // Stop filling if something is wrong
                }
            }
         } else {
            alert(`Word "${word}" (${word.length} letters) doesn't fit the number of available input cells (${sortedCells.length}) in this column.`);
            return;
         }

    } else {
         // Fallback/alternative: If word length EXACTLY matches input cells (no overlap?)
         // This case might indicate an issue with puzzle definition or logic.
         console.warn("Word length matches input cell count directly. Check puzzle definition for column", targetCol);
         sortedCells.forEach((cell, index) => {
             if (index < word.length) {
                 cell.value = word[index];
             }
         });
    }


    // Trigger solution check after filling
    checkSolutionAttempt();

    // Optional: Move focus after filling
    focusNextCell(); // Or focus the start of the next column, etc.
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
