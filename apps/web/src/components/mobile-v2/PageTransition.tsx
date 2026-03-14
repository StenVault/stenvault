/**
 * PageTransition - Animated page wrapper for smooth transitions
 * 
 * Wraps page content with fade/slide animations.
 */

import { motion, type Variants } from "framer-motion";
import { ReactNode } from "react";

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

const pageVariants: Variants = {
    initial: {
        opacity: 0,
        y: 8,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.2,
            ease: [0.25, 0.1, 0.25, 1], // easeOut as cubic bezier
        },
    },
    exit: {
        opacity: 0,
        y: -8,
        transition: {
            duration: 0.15,
            ease: [0.42, 0, 1, 1], // easeIn as cubic bezier
        },
    },
};

export function PageTransition({ children, className }: PageTransitionProps) {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={className}
            style={{
                width: "100%",
                height: "100%",
            }}
        >
            {children}
        </motion.div>
    );
}

export default PageTransition;
