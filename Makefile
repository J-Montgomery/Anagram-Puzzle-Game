COMPILER = xelatex
BUILDDIR = build
WORDLIST ?= resource/wordlist
LIST_LANG ?= en

all: anagrammiton.pdf

%.pdf: %.tex
	@mkdir -p $(BUILDDIR)
	@echo "Building $< with $(COMPILER)..."
	@$(COMPILER) -interaction=nonstopmode -output-directory=$(BUILDDIR) \
		-jobname=$(basename $@) \
		"\input{$<}" || \
		(echo "Error in compilation"; exit 1)
	@cp $(BUILDDIR)/$@ ./
	@echo "Successfully built $@"

clean:
	@echo "Cleaning up..."
	@rm -rf $(BUILDDIR)
	@rm -f *.pdf
	@echo "Clean complete"

watch:
	@echo "Watching for changes in .tex files..."
	@while true; do \
		make all; \
		inotifywait -e modify *.tex || sleep 2; \
	done

list:
	@echo "Available targets:"
	@for f in *.tex; do \
		echo "  $${f%.tex}.pdf (from $$f)"; \
	done

wordlist:
	@aspell -d $(LIST_LANG) dump master | \
		aspell -l $(LIST_LANG) expand |   \
		grep -v "'" |                     \
		tr '[:lower:]' '[:upper:]' |      \
		uniq |                            \
		sort > $(WORDLIST)
	@echo "Wordlist generation complete: $(WORDLIST)"

.PHONY: all clean watch list
