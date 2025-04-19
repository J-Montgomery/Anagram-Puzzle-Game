#!/usr/bin/env python
import nltk
from collections import Counter

nltk.download('words')
from nltk.corpus import words


def find_matching_words(anagrams, template):
    """
    Find words from the anagram list that match a given letter template.

    Args:
        anagrams (list): List of words (anagrams)
        template (list): List containing letters at fixed positions and None for wildcards
                         e.g., ['C', None, 'T'] means first letter must be 'C',
                         middle letter can be anything, last letter must be 'T'

    Returns:
        list: Words from anagrams that match the template
    """
    matching_words = []

    for word in anagrams:
        if len(word) != len(template):
            continue

        is_match = True
        for i, (word_char, template_char) in enumerate(zip(word, template)):
            if template_char is not None and word_char.lower() != template_char.lower():
                is_match = False
                break

        if is_match:
            matching_words.append(word)

    return matching_words

def find_anagrams(letters):
    """
    Find all words that can be formed using some or all of the given letters
    using NLTK's words corpus as the dictionary.

    Args:
        letters (str): String of available letters

    Returns:
        list: List of valid words that can be formed with len > 1
    """
    word_list = words.words('en')
    letter_freq = Counter(letters.lower())
    valid_words = []

    for word in word_list:
        word_lower = word.lower()

        if len(word) == 1 or len(word_lower) > len(letters):
            continue

        word_freq = Counter(word_lower)
        if all(word_freq[char] <= letter_freq[char] for char in word_freq):
            valid_words.append(word_lower)

    return valid_words

if __name__ == "__main__":
    letters = input("Base Word: ")
    anagrams = find_anagrams(letters)
    print(f"Found {len(anagrams)} possible words")
    print(sorted(anagrams, key=len, reverse=True))

    template = (None, "N")
    matching_words = find_matching_words(anagrams, template)
    print(f"Found {len(matching_words)} matching words")
    print(matching_words)


