import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface RoulletteItem {
  id: string;
  label: ReactNode;
  content?: ReactNode;
}

interface RoulletteCarouselProps {
  items: RoulletteItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  itemWidth?: number; // Width of each item in px
  showCount?: number; // How many full items to show (default 5)
}

export function RoulletteCarousel({
  items,
  selectedId,
  onSelect,
  itemWidth = 180,
  showCount = 5,
}: RoulletteCarouselProps) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        Aucun élément disponible
      </div>
    );
  }

  // Find selected index
  const selectedIndex = selectedId ? items.findIndex(item => item.id === selectedId) : 0;
  const actualSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;

  // Calculate positions and opacities
  const calculateStyle = (itemIndex: number) => {
    const distance = itemIndex - actualSelectedIndex;
    
    // Determine opacity and scale based on distance
    let opacity = 0;
    let scale = 0;
    let isVisible = false;

    if (distance === 0) {
      // Center - fully visible
      opacity = 1;
      scale = 1;
      isVisible = true;
    } else if (distance === 1 || distance === -1) {
      // Adjacent items
      opacity = 0.7;
      scale = 0.85;
      isVisible = true;
    } else if (distance === 2 || distance === -2) {
      // Half visible items
      opacity = 0.35;
      scale = 0.7;
      isVisible = true;
    } else if (distance === 3 || distance === -3) {
      // Quarter visible items with gradient
      opacity = 0.15;
      scale = 0.6;
      isVisible = true;
    } else {
      // Hidden
      opacity = 0;
      scale = 0;
      isVisible = false;
    }

    // Calculate horizontal position (centered carousel)
    // Center item should be at container center
    const centerOffset = distance * itemWidth;
    
    return {
      opacity,
      scale,
      isVisible,
      transform: `translateX(${centerOffset}px) scale(${scale})`,
    };
  };

  const scroll = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      const prevIndex = actualSelectedIndex === 0 ? items.length - 1 : actualSelectedIndex - 1;
      onSelect(items[prevIndex].id);
    } else {
      const nextIndex = actualSelectedIndex === items.length - 1 ? 0 : actualSelectedIndex + 1;
      onSelect(items[nextIndex].id);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Left Arrow */}
      <button
        onClick={() => scroll('left')}
        className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Scroll left"
      >
        <ChevronLeft size={20} />
      </button>

      {/* Carousel Container */}
      <div className="flex-1 overflow-hidden perspective">
        <div
          className="flex justify-center items-center relative"
          style={{
            width: '100%',
            perspective: '1000px',
          }}
        >
          {/* Center line indicator (visual reference) */}
          <div
            className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary/20 pointer-events-none"
            style={{ transform: 'translateX(-50%)' }}
          />

          {/* Carousel items container */}
          <div
            className="flex justify-center relative"
            style={{
              width: `${itemWidth}px`,
              height: 'auto',
              position: 'relative',
              minHeight: '140px',
            }}
          >
            {items.map((item, index) => {
              const style = calculateStyle(index);

              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={`absolute transition-all duration-300 ease-out p-3 rounded-lg border-2 text-left cursor-pointer flex items-center justify-center ${
                    index === actualSelectedIndex
                      ? 'border-primary bg-primary/10 shadow-md z-50'
                      : 'border-border bg-card hover:border-muted-foreground/50 z-10'
                  }`}
                  style={{
                    opacity: style.opacity,
                    transform: style.transform,
                    width: `${itemWidth}px`,
                    pointerEvents: style.isVisible ? 'auto' : 'none',
                    left: '50%',
                    marginLeft: `-${itemWidth / 2}px`,
                    minWidth: 'max-content',
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    {item.content}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Arrow */}
      <button
        onClick={() => scroll('right')}
        className="flex-shrink-0 p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Scroll right"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
