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

function loadPuzzleData() {
    const puzzleDataElement = document.getElementById('puzzle-data');
    if (!puzzleDataElement || puzzleDataElement.type !== 'application/json') {
        console.error('Puzzle data script tag is missing or has incorrect type!');
        return false;
    }

    try {
        // Get the JSON string from the script tag's text content
        const jsonString = puzzleDataElement.textContent;

        // Parse the JSON string into our puzzle object
        puzzle = JSON.parse(jsonString);

        // Quick validation (optional but recommended)
        if (!puzzle.rootWord || !puzzle.clue || !puzzle.solutionSentence ||
            !puzzle.solutionWords || !puzzle.layout || !puzzle.gridSize ||
            !puzzle.anagrams) {
            console.error('Puzzle data is incomplete or malformed.');
            puzzle = null; // Prevent using incomplete data
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error parsing puzzle data JSON:', error);
        return false;
    }
}

function generateGrid() {
    if (!puzzle) {
        console.error("Cannot generate grid: Puzzle data not loaded.");
        return;
    }
    const container = document.getElementById('gridContainer');
    container.innerHTML = ''; // Clear previous grid
    container.style.gridTemplateColumns = `repeat(${puzzle.gridSize.cols}, 40px)`;
    container.style.gridTemplateRows = `repeat(${puzzle.gridSize.rows}, 40px)`;

    const cellMap = new Map(); // Store cell info by "row-col" string

    // Populate map with defined cells
    puzzle.layout.forEach(cellDef => {
        const key = `${cellDef.coord[0]}-${cellDef.coord[1]}`;
        cellMap.set(key, cellDef);
    });

    // Create grid elements
    for (let r = 0; r < puzzle.gridSize.rows; r++) {
        for (let c = 0; c < puzzle.gridSize.cols; c++) {
            const key = `${r}-${c}`;
            const cellDef = cellMap.get(key);
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
                } else { // Root or Prefilled
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell');
                    cellElement.textContent = cellDef.char || '';
                    if (cellDef.type === 2) {
                        cellElement.classList.add('cell-root');
                    } else { // type 3
                        cellElement.classList.add('cell-prefilled');
                    }
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
}

function generateGrid() {
    const container = document.getElementById('gridContainer');
    container.innerHTML = ''; // Clear previous grid
    container.style.gridTemplateColumns = `repeat(${puzzle.gridSize.cols}, 40px)`;
    container.style.gridTemplateRows = `repeat(${puzzle.gridSize.rows}, 40px)`;

    const cellMap = new Map(); // Store cell info by "row-col" string

    // Populate map with defined cells
    puzzle.layout.forEach(cellDef => {
        const key = `${cellDef.coord[0]}-${cellDef.coord[1]}`;
        cellMap.set(key, cellDef);
    });

    // Create grid elements
    for (let r = 0; r < puzzle.gridSize.rows; r++) {
        for (let c = 0; c < puzzle.gridSize.cols; c++) {
            const key = `${r}-${c}`;
            const cellDef = cellMap.get(key);
            let cellElement;

            if (cellDef) {
                if (cellDef.type === 1) { // Unknown
                    cellElement = document.createElement('input');
                    cellElement.type = 'text';
                    cellElement.maxLength = 1;
                    cellElement.classList.add('grid-cell', 'cell-unknown');
                    cellElement.dataset.row = r;
                    cellElement.dataset.col = c;
                    // Add reference to puzzle layout data if needed later
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;
                } else { // Root or Prefilled
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell');
                    cellElement.textContent = cellDef.char || '';
                    if (cellDef.type === 2) {
                        cellElement.classList.add('cell-root');
                    } else { // type 3
                        cellElement.classList.add('cell-prefilled');
                    }
                     // Add reference to puzzle layout data if needed later
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
}

// --- Easy Mode Word List Population (Example) ---
function populateWordList(words) {
    const wordListDiv = document.getElementById('wordList');
    wordListDiv.innerHTML = ''; // Clear previous list
    words.forEach(word => {
        const span = document.createElement('span');
        span.textContent = word;
        span.onclick = () => {
            // TODO: Add logic to fill the selected column with this word
            console.log(`Clicked word: ${word}`);
        };
        wordListDiv.appendChild(span);
    });
     // Add placeholder if empty and easy mode is on
     if (words.length === 0 && document.getElementById('easyModeCheckbox')?.checked) {
         wordListDiv.innerHTML = '<i>Select a column or type to see suggestions.</i>';
     }
}

let solutionFadeOutTimeoutId = null;

// *** REVISED FUNCTION ***
// Checks if ALL words in the grid match the expected solution words.
function checkSolutionAttempt() {
    const solutionDisplay = document.getElementById('solutionDisplay');
    let allWordsCorrect = true; // Assume correct initially

    // Get all unique word indices present in the puzzle layout
    const wordIndices = [...new Set(puzzle.layout.map(cell => cell.wordIndex))];

    // Sort indices to check words in order (0, 1, 2...)
    wordIndices.sort((a, b) => a - b);

    for (const index of wordIndices) {
        const expectedWord = puzzle.solutionWords[index].toUpperCase();
        let enteredWord = "";

        // Find all cells (inputs and divs) for the current word index
        const wordCells = document.querySelectorAll(`[data-word-index="${index}"]`);

        // Sort the cells based on their letter index to ensure correct order
        const sortedCells = Array.from(wordCells).sort((a, b) =>
            parseInt(a.dataset.letterIndex) - parseInt(b.dataset.letterIndex)
        );

        // Build the entered word from cell values or text content
        sortedCells.forEach(cell => {
            if (cell.tagName === 'INPUT') {
                enteredWord += (cell.value || '').toUpperCase(); // Use value for inputs
            } else {
                enteredWord += (cell.textContent || '').toUpperCase(); // Use textContent for divs
            }
        });

        // Compare the entered word with the expected word for this index
        if (enteredWord !== expectedWord) {
            allWordsCorrect = false; // Found a mismatch
            break; // No need to check further words
        }
    }

    // Update the solution display based on the final result
    if (allWordsCorrect) {
        // *** Clear any pending fade-out timeout if we become correct again ***
        if (solutionFadeOutTimeoutId) {
            clearTimeout(solutionFadeOutTimeoutId);
            solutionFadeOutTimeoutId = null;
        }
        // Set text and start fade-in
        solutionDisplay.textContent = puzzle.solutionSentence;
        solutionDisplay.style.opacity = 1;

    } else {
        // Only start fade-out if there's actually text currently displayed
        if (solutionDisplay.textContent !== '') {
             // *** Start fade-out by setting opacity to 0 ***
            solutionDisplay.style.opacity = 0;

            // *** Clear previous timeout just in case ***
            if (solutionFadeOutTimeoutId) {
                clearTimeout(solutionFadeOutTimeoutId);
            }

            // *** Set timeout to clear text AFTER transition (500ms matches CSS) ***
            solutionFadeOutTimeoutId = setTimeout(() => {
                solutionDisplay.textContent = '';
                solutionFadeOutTimeoutId = null; // Clear the stored ID
            }, 500); // Duration matches the CSS transition
        }
    }
}



// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // *** LOAD PUZZLE DATA FIRST ***
    if (!loadPuzzleData()) {
        // If loading fails, show an error
        document.getElementById('clueText').textContent = 'Error loading puzzle data!';
        return; // Stop initialization
    }

    // Now that puzzle data is loaded, proceed with setup
    document.getElementById('clueText').textContent = `Clue: ${puzzle.clue}`;
    generateGrid(); // Generate the grid

    // Check initial state of easy mode checkbox
    const easyModeCheckbox = document.getElementById('easyModeCheckbox');
    if (easyModeCheckbox?.checked) {
         toggleEasyMode(true); // Call toggle function to ensure consistency
    }

    // Add listener to the grid container for input events on unknown cells
    const gridContainer = document.getElementById('gridContainer');
    if (gridContainer) {
        gridContainer.addEventListener('input', (event) => {
            if (event.target.matches('.cell-unknown')) {
                checkSolutionAttempt();
            }
        });
    }

    // Initialize solution display as hidden
    const solutionDisplay = document.getElementById('solutionDisplay');
    solutionDisplay.textContent = '';
    solutionDisplay.style.opacity = 0;
});
