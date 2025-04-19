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
    if (!possibleWordsDiv || !puzzle) return; // Added check for puzzle existence

    // Use toggle with the boolean 'force' argument
    possibleWordsDiv.classList.toggle('visible', isEasy);

    if (isEasy) {
        // Populate with random words or context-specific words
        // Ensure puzzle.anagrams exists before trying to use it
        const wordsToShow = puzzle.anagrams
            ? [...puzzle.anagrams].sort(() => 0.5 - Math.random()).slice(0, 5) // Show 5 random
            : []; // Default to empty if anagrams aren't loaded
        populateWordList(wordsToShow);
    } else {
         populateWordList([]); // Clear list when turning off
    }
}

let puzzle;
let lastFocusedCell = null;
let solutionFadeOutTimeoutId = null;
let useNativeKeyboard = false;

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

                if (prefilled.includes(letterIdx)) {
                    layoutEntry.type = 3;
                    layoutEntry.char = word[letterIdx];
                } else {
                    layoutEntry.type = 1; // Standard unknown type
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
    for (let row = 0; row < puzzle.gridSize.rows; row++) {
        for (let col = 0; col < puzzle.gridSize.cols; col++) {
            const key = `${row}-${col}`;
            const cellDef = layoutMap.get(key); // Get the definition for this coordinate, if any
            let cellElement = null; // Initialize cellElement

            if (cellDef) {
                if (cellDef.type === 1) { // Type 1: Unknown (Editable Input)
                    cellElement = document.createElement('input');
                    cellElement.type = 'text';
                    cellElement.maxLength = 1;
                    cellElement.classList.add('grid-cell', 'cell-unknown');

                    cellElement.dataset.row = row;
                    cellElement.dataset.col = col;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                    cellElement.style.textTransform = 'uppercase';
                } else if (cellDef.type === 2) { // Type 2: Root Word Cell (Display Div)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-root');
                    cellElement.textContent = cellDef.char || ''; // Display the character

                    cellElement.dataset.row = row;
                    cellElement.dataset.col = col;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                } else if (cellDef.type === 3) { // Type 3: Pre-filled Unknown Cell (Display Div)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-prefilled-unknown'); // Use specific class
                    cellElement.textContent = cellDef.char || ''; // Display the character

                    cellElement.dataset.row = row;
                    cellElement.dataset.col = col;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                } else {
                    // Handle potential unknown types or fallback
                    console.warn(`Unknown cell type ${cellDef.type} at [${row}, ${col}]. Rendering as empty.`);
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-empty');
                }

            } else {
                // No definition for this coordinate - it's an empty background cell
                cellElement = document.createElement('div');
                cellElement.classList.add('grid-cell', 'cell-empty');
            }

            if (cellElement) {
                 container.appendChild(cellElement);
            }
        }
    }

    container.addEventListener('focusin', (event) => {
        if (event.target.matches('.cell-unknown')) {
            // Set the lastFocusedCell to the first unknown cell
            lastFocusedCell = event.target;
        }
    });

    container.addEventListener('input', handleGridInput);
    container.addEventListener('keydown', handleGridKeyDown);
}

function populateWordList(words) {
    const wordListDiv = document.getElementById('wordList');
    wordListDiv.innerHTML = ''; // Clear previous list

    if (!puzzle) return;

    let displayWords = words;
    if (!displayWords || displayWords.length === 0) {
        displayWords = [...puzzle.anagrams].sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    displayWords.forEach(word => {
        const span = document.createElement('span');
        span.textContent = word;
        span.onclick = () => {
            fillColumnWithWord(word.toUpperCase());
        };
        wordListDiv.appendChild(span);
    });

    if (displayWords.length === 0 && document.getElementById('easyModeCheckbox')?.checked) {
        wordListDiv.innerHTML = '<i>No suggestions available.</i>'; // Or other message
    } else if (!lastFocusedCell && document.getElementById('easyModeCheckbox')?.checked) {
         // Optional: Guide user if easy mode is on but no cell selected
         // wordListDiv.innerHTML = '<i>Click a cell in a column to see suggestions.</i>';
    }
}

function fillColumnWithWord(word) {
    if (!lastFocusedCell || !lastFocusedCell.matches('.cell-unknown')) {
        alert("Please click on an input cell in the column you want to fill first.");
        return;
    }
    if (!word || !puzzle || !puzzle.unknowns) return;

    const targetCol = parseInt(lastFocusedCell.dataset.col);
    const wordUpper = word.toUpperCase();

    const unknownDef = puzzle.unknowns.find(u => u.columnIndex === targetCol);

    if (!unknownDef) {
        console.error(`Could not find unknown word definition for column ${targetCol}.`);
        alert("Internal error: Puzzle definition missing for this column.");
        return;
    }

    if (wordUpper.length !== unknownDef.word.length) {
         alert(`Word "${wordUpper}" (${wordUpper.length} letters) does not match the expected length (${unknownDef.word.length} letters) for this column.`);
         return;
    }


    let fillSuccessful = true;

    for (let letterIdx = 0; letterIdx < wordUpper.length; letterIdx++) {
        const targetRow = puzzle.baseRowInGrid + (letterIdx - unknownDef.overlapIndex);

        const cellElement = document.querySelector(`.grid-container .grid-cell[data-row="${targetRow}"][data-col="${targetCol}"]`);

        if (!cellElement || cellElement.classList.contains('cell-empty')) {
            // This should not happen if the puzzle layout is correct
            console.error(`Error placing word "${wordUpper}": No valid cell found at [${targetRow}, ${targetCol}] for letter index ${letterIdx}.`);
            alert(`Internal error: Grid layout mismatch for word "${wordUpper}".`);
            fillSuccessful = false;
            break;
        }

        const expectedChar = wordUpper[letterIdx];

        if (cellElement.matches('.cell-unknown')) {
            cellElement.value = expectedChar;
        } else if (cellElement.matches('.cell-root') || cellElement.matches('.cell-prefilled-unknown')) {
            const existingChar = (cellElement.textContent || '').toUpperCase();
            if (existingChar !== expectedChar) {
                 console.warn(`Word "${wordUpper}" conflicts with pre-filled cell at [${targetRow}, ${targetCol}]. Expected "${expectedChar}", found "${existingChar}".`);
                 alert(`Word "${wordUpper}" cannot be placed here because it conflicts with a pre-filled letter ('${existingChar}').`);
                 fillSuccessful = false;
                 break;
            }
        } else {
            console.error(`Error placing word "${wordUpper}": Unexpected cell type found at [${targetRow}, ${targetCol}].`);
            fillSuccessful = false;
            break;
        }
    }

    if (fillSuccessful) {
        checkSolutionAttempt();
        focusNextCell();
    }
}

function checkSolutionAttempt() {
    if (!puzzle) return;

    const solutionDisplay = document.getElementById('solutionDisplay');
    let allWordsCorrect = true;
    const expectedWords = puzzle.solutionWords;

    for (let wordIdx = 0; wordIdx < expectedWords.length; wordIdx++) {
        const expectedWord = expectedWords[wordIdx].toUpperCase();
        let enteredWord = "";

        for (let letterIdx = 0; letterIdx < expectedWord.length; letterIdx++) {
            let targetRow, targetCol;

            if (wordIdx === 0) { // Base word (index 0)
                targetRow = puzzle.baseRowInGrid;
                targetCol = letterIdx;
            } else { // Unknown word (index 1+)
                const unknownDef = puzzle.unknowns[wordIdx - 1]; // Get definition from original input
                const overlapIndex = unknownDef.overlapIndex;
                targetCol = unknownDef.columnIndex;
                targetRow = puzzle.baseRowInGrid + (letterIdx - overlapIndex);
            }

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
                console.warn(`Cell not found at [${targetRow}, ${targetCol}] for word ${wordIdx}, letter ${letterIdx}`);
            }
            enteredWord += char;
        }

        // Compare the reconstructed word with the expected word
        if (enteredWord !== expectedWord) {
            console.log(`Mismatch for word ${wordIdx}: Expected "${expectedWord}", Got "${enteredWord}"`); // Debugging line
            allWordsCorrect = false;
            break;
        }
    }

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
        if (nextCell && nextCell.value === '') {
            nextCell.focus();
            return;
        }
    }

    for (let c = startCol + 1; c < puzzle.gridSize.cols; c++) {
        for (let r = 0; r < puzzle.gridSize.rows; r++) {
            const nextCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
            if (nextCell && nextCell.value === '') {
                nextCell.focus();
                return;
            }
        }
    }

    // If still not found, wrap around: Try finding the first EMPTY cell from the top-left
    for (let c = 0; c <= startCol; c++) {
        for (let r = 0; r < puzzle.gridSize.rows; r++) {
             // Don't wrap back to the exact starting cell unless it's the only one
             if (c === startCol && r === startRow) continue;

            const nextCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
            if (nextCell && nextCell.value === '') {
                nextCell.focus();
                return;
            }
        }
    }


    // If no empty cell is found anywhere, do nothing
}
function handleBackspace() {
    if (!lastFocusedCell) return;

    const currentCell = lastFocusedCell;
    const currentRow = parseInt(currentCell.dataset.row);
    const currentCol = parseInt(currentCell.dataset.col);

    // If cell has content, just clear it (don't move focus yet)
    if (currentCell.value !== '') {
        currentCell.value = '';
        return;
    }

    // If cell is already empty, move focus backward
    // 1. Try finding previous cell up in the same column
    for (let r = currentRow - 1; r >= 0; r--) {
        const prevCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${currentCol}"]`);
        if (prevCell) {
            prevCell.focus();
            // prevCell.select();
            return;
        }
    }

    // 2. Try finding the last cell in the previous columns to the left
    for (let c = currentCol - 1; c >= 0; c--) {
        for (let r = puzzle.gridSize.rows - 1; r >= 0; r--) {
            const prevCell = document.querySelector(`.grid-cell.cell-unknown[data-row="${r}"][data-col="${c}"]`);
            if (prevCell) {
                prevCell.focus();
                // prevCell.select();
                return;
            }
        }
    }
}

function handleVirtualKeyboardClick(event) {
    if (!event.target.matches('.key')) return;

    const key = event.target.textContent;

    if (!lastFocusedCell) {
        const firstInput = document.querySelector('.grid-cell.cell-unknown');
        if (firstInput) firstInput.focus();
        if (!lastFocusedCell) return;
    }

    if (key === 'Enter') {
        focusNextCell();
    } else if (key === '⌫') { // Backspace
        handleBackspace();
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') { // Letter key
        lastFocusedCell.value = key;
        checkSolutionAttempt();
        focusNextCell();
    }
}

function handleGridInput(event) {
    if (!event.target.matches('.cell-unknown')) return;

    event.target.value = event.target.value.toUpperCase();
    checkSolutionAttempt();

    if (event.target.value.length === 1) {
         // Use setTimeout to allow the input event to fully resolve before changing focus
         setTimeout(focusNextCell, 0);
    }
}

// *** EVENT HANDLER for physical keyboard special keys (Tab, Backspace, Enter) in the grid ***
function handleGridKeyDown(event) {
    if (!event.target.matches('.cell-unknown')) return;

    if (event.key === 'Enter') {
        event.preventDefault();
        focusNextCell();
    } else if (event.key === 'Tab') {
        event.preventDefault();
        focusNextCell();
    } else if (event.key === 'Backspace') {
        if (event.target.value === '') {
            event.preventDefault();
            handleBackspace();
        }
    }
}

function toggleNativeKeyboard(isEnabled) {
    useNativeKeyboard = isEnabled; // Update the state variable

    // Get all the editable grid cells
    const inputCells = document.querySelectorAll('.grid-container .cell-unknown');

    inputCells.forEach(cell => {
        if (useNativeKeyboard) {
            // Allow native keyboard: remove the inputmode attribute
            cell.removeAttribute('inputmode');
            // Optional: Reset cursor if you changed it in CSS
            // cell.style.cursor = '';
        } else {
            // Suppress native keyboard
            cell.inputMode = 'none';
            // Optional: Set cursor if using CSS cue
            // cell.style.cursor = 'default';

            // *** Crucial for iOS Safari ***
            // Setting readOnly briefly and removing it can help
            // ensure the keyboard is dismissed if it was somehow shown.
            cell.readOnly = true;
            setTimeout(() => { cell.readOnly = false; }, 0);
        }
    });

    // Optional: If a cell is focused, blur and re-focus to apply change immediately
    if (document.activeElement && document.activeElement.matches('.cell-unknown')) {
        const currentFocus = document.activeElement;
        currentFocus.blur();
        // Re-focus might bring up keyboard if enabled, which is desired
        // Use timeout to ensure blur completes
        setTimeout(() => currentFocus.focus(), 0);
    }

    console.log(`Native keyboard ${useNativeKeyboard ? 'enabled' : 'disabled'}`);
}

document.addEventListener('DOMContentLoaded', () => {
    const nativeKeyboardCheckbox = document.getElementById('nativeKeyboardCheckbox');
    if (nativeKeyboardCheckbox) {
         useNativeKeyboard = nativeKeyboardCheckbox.checked;
    }

    if (!loadPuzzleData()) {
        return;
    }

    document.getElementById('clueText').textContent = `Clue: ${puzzle.clue}`;
    generateGrid();

    toggleNativeKeyboard(useNativeKeyboard);

    const firstInputCell = document.querySelector('.grid-cell.cell-unknown');
    if (firstInputCell) {
        lastFocusedCell = firstInputCell;
        firstInputCell.focus();
    }

    const easyModeCheckbox = document.getElementById('easyModeCheckbox');
    if (easyModeCheckbox?.checked) { toggleEasyMode(true); }

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

    const solutionDisplay = document.getElementById('solutionDisplay');
    solutionDisplay.textContent = '';
    solutionDisplay.style.opacity = 0;
});
