function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let i = 0; i < modals.length; i++) {
        if (event.target == modals[i]) {
            closeModal(modals[i].id);
        }
    }
    populateWordList();
}

function toggleEasyMode(isEasy) {
    const possibleWordsDiv = document.getElementById('possibleWords');
    if (!possibleWordsDiv || !puzzle) return;

    possibleWordsDiv.classList.toggle('visible', isEasy);

    if (!isEasy) {
        lastFocusedCell = null;
    }
    populateWordList();
}

function getCharFrequency(word) {
    const freq = {};
    for (const char of word) {
        freq[char] = (freq[char] || 0) + 1;
    }
    return freq;
}

function isPartialAnagram(word, baseWord) {
    if (word.length > baseWord.length) {
        return false;
    }
    const upperWord = word.toUpperCase();
    const upperBaseWord = baseWord.toUpperCase();

    const wordFreq = getCharFrequency(upperWord);
    const baseFreq = getCharFrequency(upperBaseWord);

    for (const char in wordFreq) {
        if (!baseFreq[char] || wordFreq[char] > baseFreq[char]) {
            return false;
        }
    }

    return true;
}

function getGridCellElement(row, col) {
    return document.querySelector(`.grid-container [data-row="${row}"][data-col="${col}"]`);
}

function isCellCorrect(cell) {
    if (!cell || !cell.matches('.cell-unknown') || cell.value === '') {
        return true;
    }
    if (!puzzle || !puzzle.solutionWords) {
        console.warn("Cannot check correctness: Puzzle data missing.");
        return true;
    }

    const wordIndex = parseInt(cell.dataset.wordIndex, 10);
    const letterIndex = parseInt(cell.dataset.letterIndex, 10);

    if (isNaN(wordIndex) || isNaN(letterIndex) || !puzzle.solutionWords[wordIndex] || letterIndex < 0 || letterIndex >= puzzle.solutionWords[wordIndex].length) {
        console.warn(`Cannot check correctness: Invalid data attributes or word definition for cell at [${cell.dataset.row}, ${cell.dataset.col}]`);
        return true;
    }

    const correctWord = puzzle.solutionWords[wordIndex].toUpperCase();
    const correctLetter = correctWord[letterIndex];

    return cell.value.toUpperCase() === correctLetter;
}

async function loadAndFilterDictionary(baseWord, additions = []) {
    const dictionaryPath = '/resource/wordlist';

    try {
        const response = await fetch(dictionaryPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const allWords = text.split(/\r?\n/);

        const filteredWords = allWords.filter(word =>
            word &&
            word.length > 1 &&
            isPartialAnagram(word, baseWord)
        );

        filteredWords.push(...additions);

        console.info(`Dictionary loaded. Found ${filteredWords.length} partial anagrams of "${baseWord}".`);
        return filteredWords;

    } catch (error) {
        console.error(`Error loading or processing dictionary from ${dictionaryPath}:`, error);
        return [];
    }
}

function getWordInfoFromCell(cellElement, puzzle) {
    if (!cellElement || !cellElement.dataset || !puzzle || !puzzle.solutionWords) {
        return null;
    }

    const row = parseInt(cellElement.dataset.row, 10);
    const col = parseInt(cellElement.dataset.col, 10);

    if (isNaN(row) || isNaN(col)) {
        return null;
    }

    if (row === puzzle.baseRowInGrid && col >= 0 && col < puzzle.solutionWords[0].length) {
        const word = puzzle.solutionWords[0].toUpperCase();
        const cells = [];
        for (let i = 0; i < word.length; i++) {
            cells.push(getGridCellElement(row, i));
        }
        return {
            wordIndex: 0,
            word: word,
            orientation: 'horizontal',
            length: word.length,
            cells: cells.filter(c => c != null),
            startRow: row,
            startCol: 0
        };
    }

    // Iterate through unknowns (solutionWords index 1 onwards)
    for (let i = 0; i < puzzle.unknowns.length; i++) {
        const unknownDef = puzzle.unknowns[i];
        const wordIndex = i + 1; // Index in solutionWords
        const word = puzzle.solutionWords[wordIndex].toUpperCase();

        if (col === unknownDef.columnIndex) {
            // Check if the row is within the vertical bounds of this word
            const overlapIndex = unknownDef.overlapIndex;
            const startRow = puzzle.baseRowInGrid - overlapIndex;
            const endRow = startRow + word.length - 1;

            if (row >= startRow && row <= endRow) {
                const cells = [];
                for (let j = 0; j < word.length; j++) {
                    cells.push(getGridCellElement(startRow + j, col));
                }
                return {
                    wordIndex: wordIndex,
                    word: word,
                    orientation: 'vertical',
                    length: word.length,
                    cells: cells.filter(c => c != null),
                    startRow: startRow,
                    startCol: col
                };
            }
        }
    }

    return null;
}

function getGridCellElement(row, col) {
    return document.querySelector(`.grid-container .grid-cell[data-row="${row}"][data-col="${col}"]`);
}

let puzzle;
let lastFocusedCell = null;
let solutionFadeOutTimeoutId = null;
let useNativeKeyboard = false;
let touchedKeyElement = null;
let dictionaryWords = [];
let gridContainer, possibleWordsDiv, keyboardDiv;

function loadPuzzleData() {
    const puzzleDataElement = document.getElementById('puzzle-data');
    if (!puzzleDataElement || puzzleDataElement.type !== 'application/json') {
        console.error('Puzzle data script tag is missing or has incorrect type!');
        return false;
    }

    try {
        const jsonString = puzzleDataElement.textContent;
        const rawPuzzleData = JSON.parse(jsonString);

        if (!rawPuzzleData.baseWord || !rawPuzzleData.clue || !rawPuzzleData.solutionSentence || !rawPuzzleData.unknowns || !rawPuzzleData.anagrams) {
            console.error('Puzzle data is incomplete.');
            return false;
        }

        const baseWord = rawPuzzleData.baseWord.toUpperCase();
        const unknowns = rawPuzzleData.unknowns;

        let minRow = 0;
        let maxRow = 0;
        const generatedLayout = [];
        const solutionWords = [baseWord];

        // Determine vertical bounds based on unknowns
        unknowns.forEach((unknown, index) => {
            const word = unknown.word.toUpperCase();
            const col = unknown.columnIndex;
            const overlap = unknown.overlapIndex;

            // Sanity checks
            if (col < 0 || col >= baseWord.length) { throw new Error(`Invalid columnIndex ${col} for word "${word}". Must be between 0 and ${baseWord.length - 1}.`); }
            if (overlap < 0 || overlap >= word.length) { throw new Error(`Invalid overlapIndex ${overlap} for word "${word}". Must be between 0 and ${word.length - 1}.`); }
            if (word[overlap] !== baseWord[col]) { throw new Error(`Character mismatch for word "${word}" at columnIndex ${col}. Expected "${baseWord[col]}", got "${word[overlap]}".`); }

            const topRowForWord = 0 - overlap;
            const bottomRowForWord = 0 + (word.length - 1 - overlap);
            minRow = Math.min(minRow, topRowForWord);
            maxRow = Math.max(maxRow, bottomRowForWord);
            solutionWords.push(word);
        });

        const gridCols = baseWord.length;
        const gridRows = maxRow - minRow + 1;
        const baseRowInGrid = 0 - minRow;

        for (let i = 0; i < baseWord.length; i++) {
            generatedLayout.push({
                type: 2,
                coord: [baseRowInGrid, i],
                char: baseWord[i],
                wordIndex: 0,
                letterIndex: i
            });
        }

        unknowns.forEach((unknownDef, index) => {
            const word = unknownDef.word.toUpperCase();
            const col = unknownDef.columnIndex;
            const overlap = unknownDef.overlapIndex;
            const wordIndex = index + 1;
            const prefilled = unknownDef.prefilledIndices || [];

            for (let letterIdx = 0; letterIdx < word.length; letterIdx++) {
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
                    layoutEntry.type = 1;
                }
                generatedLayout.push(layoutEntry);
            }
        });

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
    if (!puzzle || !puzzle.gridSize || !puzzle.layout || !puzzle.baseRowInGrid === undefined) {
        console.error("Cannot generate grid: Puzzle data not processed correctly or missing baseRowInGrid.");
        const container = document.getElementById('gridContainer');
        if(container) container.innerHTML = '<p style="color: red;">Error loading puzzle grid.</p>';
        return;
    }

    const container = document.getElementById('gridContainer');
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${puzzle.gridSize.cols}, 40px)`;
    container.style.gridTemplateRows = `repeat(${puzzle.gridSize.rows}, 40px)`;

    const layoutMap = new Map();
    puzzle.layout.forEach(cellDef => {
        const key = `${cellDef.coord[0]}-${cellDef.coord[1]}`;
        layoutMap.set(key, cellDef);
    });

    // Create grid cell elements based on calculated dimensions and layoutMap
    for (let row = 0; row < puzzle.gridSize.rows; row++) {
        for (let col = 0; col < puzzle.gridSize.cols; col++) {
            const key = `${row}-${col}`;
            const cellDef = layoutMap.get(key);
            let cellElement = null;

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
                    cellElement.textContent = cellDef.char || '';

                    cellElement.dataset.row = row;
                    cellElement.dataset.col = col;
                    cellElement.dataset.wordIndex = cellDef.wordIndex;
                    cellElement.dataset.letterIndex = cellDef.letterIndex;

                } else if (cellDef.type === 3) { // Type 3: Pre-filled Unknown Cell (Display Div)
                    cellElement = document.createElement('div');
                    cellElement.classList.add('grid-cell', 'cell-prefilled-unknown');
                    cellElement.textContent = cellDef.char || '';

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
        populateWordList();
    });

    container.addEventListener('input', handleGridInput);
    container.addEventListener('keydown', handleGridKeyDown);
}

function populateWordList() {
    const wordListDiv = document.getElementById('wordList');
    const easyModeCheckbox = document.getElementById('easyModeCheckbox');
    wordListDiv.innerHTML = '';

    if (!puzzle || !dictionaryWords || !easyModeCheckbox || !easyModeCheckbox.checked) {
        wordListDiv.innerHTML = ''; // Ensure it's clear if easy mode is off
        return;
    }

    if (!lastFocusedCell) {
        wordListDiv.innerHTML = '<i>Click a cell to see suggestions.</i>';
        return;
    }

    const wordInfo = getWordInfoFromCell(lastFocusedCell, puzzle);

    if (!wordInfo) {
        wordListDiv.innerHTML = '<i>No suggestions for this area.</i>';
        return;
    }

    const targetLength = wordInfo.length;
    const correctWord = wordInfo.word.toUpperCase();
    let suggestions = [];

    const currentGridLetters = wordInfo.cells.map(cell => {
        if (!cell) return null;
        if (cell.tagName === 'INPUT') {
            return cell.value.toUpperCase() || null;
        } else {
            return cell.textContent.toUpperCase() || null;
        }
    });

    if (!Array.isArray(dictionaryWords)) {
        console.warn("populateWordList called before dictionaryWords was initialized as an array.");
        return;
    }

    suggestions = dictionaryWords.filter(dictWord => {
        const upperDictWord = dictWord.toUpperCase();
        if (upperDictWord.length !== targetLength) {
            return false;
        }

        for (let i = 0; i < targetLength; i++) {
            const gridLetter = currentGridLetters[i];
            if (gridLetter && gridLetter !== upperDictWord[i]) {
                return false;
            }
        }

        return true;
    });

    let displayWords = [];
    if (suggestions.length > 5) {
        const correctWordInSuggestions = suggestions.includes(correctWord);
        let candidates = suggestions.filter(w => w !== correctWord);

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        displayWords = candidates.slice(0, 4);
        if (correctWordInSuggestions) {
             displayWords.push(correctWord);
        } else if (displayWords.length < 5) {
             if(candidates.length > 4) displayWords.push(candidates[4]);
        }

    } else {
        displayWords = suggestions;
         for (let i = displayWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [displayWords[i], displayWords[j]] = [displayWords[j], displayWords[i]];
        }
    }

    if (displayWords.length === 0) {
        wordListDiv.innerHTML = '<i>No matching words found.</i>';
    } else {
        displayWords.forEach(word => {
            const span = document.createElement('span');
            span.textContent = word.toUpperCase();
            span.onclick = () => {
                fillColumnWithWord(word.toUpperCase(), wordInfo);
            };
            wordListDiv.appendChild(span);
        });
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
    const nextArrow = document.getElementById('nextPuzzleLink');
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
                const unknownDef = puzzle.unknowns[wordIdx - 1];
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
                    char = (cellElement.textContent || '').toUpperCase();
                }
            } else {
                console.warn(`Cell not found at [${targetRow}, ${targetCol}] for word ${wordIdx}, letter ${letterIdx}`);
            }
            enteredWord += char;
        }

        if (enteredWord !== expectedWord) {
            allWordsCorrect = false;
            break;
        }
    }

    if (allWordsCorrect) {
        if (solutionFadeOutTimeoutId) { clearTimeout(solutionFadeOutTimeoutId); solutionFadeOutTimeoutId = null; }
        solutionDisplay.textContent = puzzle.solutionSentence;
        solutionDisplay.style.opacity = 1;
        solutionDisplay.style.visibility = 'visible';

        if (nextArrow) {
            nextArrow.classList.add('visible');
        }
        console.log('Solution is correct!');
    } else {
        if (solutionDisplay.textContent !== '') {
            if (nextArrow) {
                nextArrow.classList.remove('visible');
            }

            solutionDisplay.style.visibility = 'hidden';
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
    if (!lastFocusedCell || !puzzle || !puzzle.gridSize) return;

    const startRow = parseInt(lastFocusedCell.dataset.row, 10);
    const startCol = parseInt(lastFocusedCell.dataset.col, 10);
    const numRows = puzzle.gridSize.rows;
    const numCols = puzzle.gridSize.cols;

    let firstAvailableNextCell = null;
    const search = (findEmptyOnly) => {
        for (let r = startRow + 1; r < numRows; r++) {
            const cell = getGridCellElement(r, startCol);
            if (cell && cell.matches('.cell-unknown')) {
                if (!firstAvailableNextCell) firstAvailableNextCell = cell;
                if (findEmptyOnly && cell.value === '') {
                    cell.focus();
                    return true;
                } else if (!findEmptyOnly) {
                    cell.focus();
                    return true;
                }
            }
        }

        for (let c = startCol + 1; c < numCols; c++) {
            for (let r = 0; r < numRows; r++) {
                const cell = getGridCellElement(r, c);
                if (cell && cell.matches('.cell-unknown')) {
                    if (!firstAvailableNextCell) firstAvailableNextCell = cell;
                    if (findEmptyOnly && cell.value === '') {
                        cell.focus();
                        return true;
                    } else if (!findEmptyOnly) {
                        cell.focus();
                        return true;
                    }
                }
            }
        }
        return false;
    };

    let foundTarget = search(true);

    if (!foundTarget) {
        if (firstAvailableNextCell) {
            firstAvailableNextCell.focus();
        }
    }
}

function handleBackspace() {
    if (!lastFocusedCell || !puzzle || !puzzle.gridSize) return;

    const currentCell = lastFocusedCell;
    const currentRow = parseInt(currentCell.dataset.row, 10);
    const currentCol = parseInt(currentCell.dataset.col, 10);

    if (currentCell.value !== '') {
        currentCell.value = '';
        return;
    }

    // Try finding previous unknown cell up in the same column
    for (let r = currentRow - 1; r >= 0; r--) {
        const prevCell = getGridCellElement(r, currentCol);
        if (prevCell && prevCell.matches('.cell-unknown')) {
            prevCell.focus();
            return;
        }
    }

    // Try finding the last unknown cell in the previous columns (right-to-left, bottom-to-top)
    for (let c = currentCol - 1; c >= 0; c--) {
        for (let r = puzzle.gridSize.rows - 1; r >= 0; r--) {
            const prevCell = getGridCellElement(r, c);
            if (prevCell && prevCell.matches('.cell-unknown')) {
                prevCell.focus();
                return;
            }
        }
    }
}

function moveFocusInDirection(startRow, startCol, dRow, dCol) {
    if (!puzzle || !puzzle.gridSize) return;
    const numRows = puzzle.gridSize.rows;
    const numCols = puzzle.gridSize.cols;

    let currentRow = startRow + dRow;
    let currentCol = startCol + dCol;

    // Loop in the specified direction until a valid cell is found or bounds exceeded
    while (currentRow >= 0 && currentRow < numRows && currentCol >= 0 && currentCol < numCols) {
        const cell = getGridCellElement(currentRow, currentCol);
        if (cell && cell.matches('.cell-unknown')) {
            cell.focus();
            return; // Found and focused
        }
        // Move one more step in the same direction
        currentRow += dRow;
        currentCol += dCol;
    }

    // If no cell found in that direction, stay in the original cell
    const originalCell = getGridCellElement(startRow, startCol);
    if (originalCell) {
        originalCell.focus();
    }
}

function handleKeyboardTouchStart(event) {
    if (event.target.matches('.key')) {
        touchedKeyElement = event.target;
        touchedKeyElement.classList.add('key-pressed-visual');
    } else {
        touchedKeyElement = null;
    }
}

function handleKeyboardTouchEnd(event) {
    if (touchedKeyElement) {
        touchedKeyElement.classList.remove('key-pressed-visual');
        const touch = event.changedTouches[0];
        const elementReleasedOn = document.elementFromPoint(touch.clientX, touch.clientY);
        touchedKeyElement = null;
    }
}

function handleKeyboardTouchCancel(event) {
    if (touchedKeyElement) {
        touchedKeyElement.classList.remove('key-pressed-visual');
        touchedKeyElement = null;
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

    console.log('handleVirtualKeyboardClick', key);
    if (key === 'Enter') {
        focusNextCell();
    } else if (key === '⌫') { // Backspace
        handleBackspace();
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
        lastFocusedCell.value = key;
        checkSolutionAttempt();
        focusNextCell();
    }
    populateWordList();
}

function handleGridInput(event) {
    if (!event.target.matches('.cell-unknown')) return;

    event.target.value = event.target.value.toUpperCase();
    checkSolutionAttempt();

    if (event.target.value.length === 1) {
         // Use setTimeout to allow the input event to fully resolve before changing focus
         setTimeout(focusNextCell, 0);
    }
    populateWordList();
}

function handleGridKeyDown(event) {
    if (!event.target.matches('.cell-unknown')) return;
    if (event.repeat) return;

    const currentCell = event.target;
    const currentRow = parseInt(currentCell.dataset.row, 10);
    const currentCol = parseInt(currentCell.dataset.col, 10);
    let preventDefault = true;
    let moveFocus = false;

    switch (event.key) {
        case 'Enter':
        case 'Tab':
            focusNextCell();
            moveFocus = true;
            break;

        case 'Backspace':
            handleBackspace();
            moveFocus = true;
            break;

        case 'ArrowUp':
            moveFocusInDirection(currentRow, currentCol, -1, 0);
            moveFocus = true;
            break;
        case 'ArrowDown':
            moveFocusInDirection(currentRow, currentCol, 1, 0);
            moveFocus = true;
            break;
        case 'ArrowLeft':
            moveFocusInDirection(currentRow, currentCol, 0, -1);
            moveFocus = true;
            break;
        case 'ArrowRight':
            moveFocusInDirection(currentRow, currentCol, 0, 1);
            moveFocus = true;
            break;

        default:
            if (event.key.length === 1 && event.key.match(/[a-z]/i)) {
                currentCell.value = event.key.toUpperCase();
                checkSolutionAttempt();
                focusNextCell();
                moveFocus = true;
            } else {
                preventDefault = false;
            }
            break;
    }

    if (preventDefault) {
        event.preventDefault();
    }

    setTimeout(populateWordList, 0);
}

function toggleNativeKeyboard(isEnabled) {
    useNativeKeyboard = isEnabled;

    // Get all the editable grid cells
    const inputCells = document.querySelectorAll('.grid-container .cell-unknown');

    inputCells.forEach(cell => {
        if (useNativeKeyboard) {
            cell.removeAttribute('inputmode');
        } else {
            // Suppress native keyboard
            cell.inputMode = 'none';

            // Safari Workaround
            // Setting readOnly briefly and removing it can help
            // ensure the keyboard is dismissed if it was somehow shown.
            cell.readOnly = true;
            setTimeout(() => { cell.readOnly = false; }, 0);
        }
    });

    if (document.activeElement && document.activeElement.matches('.cell-unknown')) {
        const currentFocus = document.activeElement;
        currentFocus.blur();
        setTimeout(() => currentFocus.focus(), 0);
    }

    console.info(`Native keyboard ${useNativeKeyboard ? 'enabled' : 'disabled'}`);
}

async function initializeDictionary() {
    try {
        dictionaryWords = await loadAndFilterDictionary(puzzle.baseWord, puzzle.anagrams);
        if (!Array.isArray(dictionaryWords)) {
             console.error("Dictionary did not load as an array!", dictionaryWords);
             dictionaryWords = []; // Fallback
        }
        populateWordList();

    } catch (error) {
        console.error("Failed to initialize game:", error);
    }
}

// document.addEventListener('DOMContentLoaded', () => {
function initializeGame() {
    
    const nativeKeyboardCheckbox = document.getElementById('nativeKeyboardCheckbox');
    if (nativeKeyboardCheckbox) {
         useNativeKeyboard = nativeKeyboardCheckbox.checked;
    }

    if (!loadPuzzleData()) {
        return;
    }

    initializeDictionary();

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
        keyboard.addEventListener('touchstart', handleKeyboardTouchStart, { passive: true });
        keyboard.addEventListener('touchend', handleKeyboardTouchEnd);
        keyboard.addEventListener('touchcancel', handleKeyboardTouchCancel);
    }

    const solutionDisplay = document.getElementById('solutionDisplay');
    solutionDisplay.textContent = '';
    solutionDisplay.style.opacity = 0;
};

initializeGame();
