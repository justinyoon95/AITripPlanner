import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  SlidersHorizontal,
  Route,
  MapPin,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const destinations = [
  {
    name: "Kyoto, Japan",
    label: "Quiet streets. Endless discoveries.",
    image: "photo-1493976040374-85c8e12f0c0e",
    query: "Kyoto, Japan",
  },
  {
    name: "Lisbon, Portugal",
    label: "A slower pace, a sunnier outlook.",
    image: "photo-1555881400-74d7acaacd8b",
    query: "Lisbon, Portugal",
  },
  {
    name: "The Dolomites, Italy",
    label: "Take the scenic route.",
    image: "photo-1464822759023-fed622ff2c3b",
    query: "Dolomites, Italy",
  },
];

export default function HomePage() {
  return (
    <main id="main">
      <section className="hero">
        <Image
          src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2200&q=85"
          alt="A wooden boat on a clear lake framed by mountain peaks"
          fill
          priority
          unoptimized
          className="hero-image"
          sizes="100vw"
        />
        <div className="hero-shade" />
        <div className="shell hero-content">
          <span className="eyebrow light">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>
            Travel plans.
            <br />
            Personal possibilities.
          </h1>
          <p>
            A trip that feels like you. Bring your destination and your
            curiosity. We&apos;ll help you shape the days.
          </p>
          <Link href="/trips/new" className={`${buttonVariants()} hero-cta`}>
            Plan your trip <ArrowUpRight size={19} />
          </Link>
          <span className="hero-note">
            Explore a sample itinerary. No sign-up needed.
          </span>
        </div>
        <div className="hero-location">
          <MapPin size={14} /> Somewhere worth slowing down.
        </div>
      </section>
      <section className="shell intro-section">
        <div>
          <span className="eyebrow">LESS LOGISTICS. MORE LIVING.</span>
          <h2>
            Good trips start with
            <br />a little direction.
          </h2>
        </div>
        <p>
          From the first coffee to the last sunset, make space for what you
          love. Start with a day-by-day plan you can explore at your own pace.
        </p>
      </section>
      <section className="shell steps" aria-label="Planning steps">
        {[
          {
            icon: MapPin,
            number: "01",
            title: "Pick your somewhere",
            text: "A city you've dreamed of. A place you've never heard of. It starts with a destination.",
          },
          {
            icon: SlidersHorizontal,
            number: "02",
            title: "Make it your kind of trip",
            text: "Set your dates, budget, interests, and the pace that feels right.",
          },
          {
            icon: Route,
            number: "03",
            title: "See your days take shape",
            text: "Preview activities and estimated costs in a clear, day-by-day itinerary.",
          },
        ].map(({ icon: Icon, ...step }) => (
          <article key={step.number}>
            <div className="step-top">
              <Icon size={23} strokeWidth={1.5} />
              <span>{step.number}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </section>
      <section className="shell destination-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A LITTLE INSPIRATION</span>
            <h2>Where will curiosity take you?</h2>
          </div>
          <Link href="/trips/new" className="text-link">
            Choose your destination <ArrowRight size={17} />
          </Link>
        </div>
        <div className="destination-grid">
          {destinations.map((place) => (
            <Link
              key={place.name}
              href={`/trips/new?destination=${encodeURIComponent(place.query)}`}
              className="destination-card"
            >
              <div className="destination-image">
                <Image
                  src={`https://images.unsplash.com/${place.image}?auto=format&fit=crop&w=900&q=80`}
                  alt={
                    place.name === "Kyoto, Japan"
                      ? "Traditional Japanese street and pagoda"
                      : place.name === "Lisbon, Portugal"
                        ? "Colorful architecture in Lisbon"
                        : "Dramatic mountain peaks"
                  }
                  fill
                  unoptimized
                  sizes="(max-width: 700px) 100vw, 33vw"
                />
                <span className="destination-arrow">
                  <ArrowUpRight size={19} />
                </span>
              </div>
              <h3>{place.name}</h3>
              <p>{place.label}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="closing-band">
        <div className="shell closing-inner">
          <CalendarDays size={30} strokeWidth={1.4} />
          <div>
            <h2>Your next adventure, one day at a time.</h2>
            <p>Start with the possibilities. Make the plan your own.</p>
          </div>
          <Link href="/trips/new" className={buttonVariants()}>
            Let&apos;s make a plan <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
