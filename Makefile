COMPILER = xelatex
BUILDDIR = build

FONT ?= "Libertinus Serif"

all: crossword.pdf

%.pdf: %.tex
	@mkdir -p $(BUILDDIR)
	@echo "Building $< with $(COMPILER)..."
	@$(COMPILER) -interaction=nonstopmode -output-directory=$(BUILDDIR) \
		-jobname=$(basename $@) \
		"\def\mainfont{$(FONT)}\input{$<}" || \
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

.PHONY: all clean watch list
