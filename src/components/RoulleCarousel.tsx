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
  const calculateStyle = (distance: number) => {
    // Determine opacity and scale based on distance from center
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
      // Next items
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

    return {
      opacity,
      scale,
      isVisible,
    };
  };

  // Create an ordered array of items with their distances from center
  const orderedItems = items.map((item, index) => {
    const distance = index - actualSelectedIndex;
    const style = calculateStyle(distance);
    
    return {
      ...item,
      index,
      distance,
      ...style,
    };
  }).sort((a, b) => {
    // Sort by distance (center first, then left/right alternating)
    if (Math.abs(a.distance) !== Math.abs(b.distance)) {
      return Math.abs(a.distance) - Math.abs(b.distance);
    }
    // For same distance, put left (negative) before right (positive)
    return a.distance - b.distance;
  });

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
      <div className="flex-1 flex justify-center items-center">
        {/* Items wrapper - displays items with transforms */}
        <div
          className="flex justify-center items-center gap-2 relative"
          style={{
            perspective: '1000px',
          }}
        >
          {orderedItems.map((item) => {
            const isCenter = item.distance === 0;
            
            // Only show items within distance 3
            if (Math.abs(item.distance) > 3) {
              return null;
            }
            
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`transition-all duration-500 ease-out p-2 rounded-lg border-2 text-left flex flex-col items-center justify-center flex-shrink-0 text-xs ${
                  isCenter
                    ? 'border-primary bg-primary/10 shadow-lg z-50'
                    : 'border-border bg-card hover:border-muted-foreground/50'
                }`}
                style={{
                  opacity: item.opacity,
                  transform: `scale(${item.scale})`,
                  width: `${itemWidth}px`,
                  minHeight: `${80 * item.scale}px`,
                  pointerEvents: item.isVisible ? 'auto' : 'none',
                  cursor: item.isVisible ? 'pointer' : 'default',
                  transition: 'all 500ms ease-out',
                }}
              >
                <div className="flex items-center gap-2 justify-center flex-wrap text-center">
                  {item.content}
                </div>
              </button>
            );
          })}
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
